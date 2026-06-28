// Empire MD - Connection Server, Pairing Engine, & Onboarding Portal (FIXED)
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const config = require('./config');
const { handleMessage } = require('./lib/msgHandler');
const { registerBot, getPublicBots, updateSettings, getSettings } = require('./lib/database');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const activeSessions = {};

function generateSessionId(botName) {
  const formattedName = botName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `BOTWAN_${formattedName}_${randomSuffix}`;
}

// Core connection routine — reusable so we can reconnect
async function startSession(sessionId, botName, cleanPhone) {
  const sessionFolder = path.join(__dirname, `sessions/${sessionId}`);
  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: ["BOT-WAN", "Chrome", "1.0.0"]
  });

  if (!activeSessions[sessionId]) {
    activeSessions[sessionId] = {
      botName, phoneNumber: cleanPhone, status: 'pairing',
      pairingCode: null, error: null, expiry: Date.now() + 120000
    };
  }
  activeSessions[sessionId].sock = sock;
  activeSessions[sessionId].saveCreds = saveCreds;

  sock.ev.on('creds.update', saveCreds);

  // FIX #3: request pairing code immediately, guarded by registration state
  if (!sock.authState.creds.registered) {
    try {
      const code = await sock.requestPairingCode(cleanPhone);
      activeSessions[sessionId].pairingCode = code;
      console.log(`🔑 Pairing code for ${sessionId}: ${code}`);
    } catch (err) {
      console.error("Error requesting pairing code:", err);
      activeSessions[sessionId].error = "Failed to generate pairing code. Try a different number.";
    }
  }

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log(`🔌 Connection closed for ${sessionId}. Reason: ${reason}`);

      if (reason === DisconnectReason.loggedOut) {
        delete activeSessions[sessionId];
      } else {
        // FIX #4: actually reconnect (handles 515 restartRequired after pairing)
        console.log(`🔄 Reconnecting session ${sessionId}...`);
        setTimeout(() => startSession(sessionId, botName, cleanPhone), 2000);
      }
    } else if (connection === 'open') {
      console.log(`✅ Session ${sessionId} connected!`);
      activeSessions[sessionId].status = 'connected';

      const ownerJid = cleanPhone + '@s.whatsapp.net';
      const channelUrl = "https://whatsapp.com/channel/0029VaI3OXiF6smuq5LxxN15";
      const welcomeDm = `✨ *Welcome to ${botName}!* ✨\n\nYour Empire WhatsApp bot is connected under Session ID:\n👉 *${sessionId}*\n\n_Type .help to view your commands!_`;

      try {
        await sock.sendMessage(ownerJid, {
          text: welcomeDm,
          contextInfo: {
            externalAdReply: {
              title: "BOT-WAN Official Onboarding",
              body: "The future of WhatsApp automation is now.",
              mediaType: 1,
              sourceUrl: channelUrl
            }
          }
        });
      } catch (dmErr) {
        console.error("Failed to send welcome DM:", dmErr.message);
      }

      await registerBot(sessionId, botName, cleanPhone);
    }
  });

  return sock;
}

// API 1: Request Pairing Code
app.post('/api/connect', async (req, res) => {
  try {
    const { phoneNumber, botName } = req.body;
    if (!phoneNumber || !botName) {
      return res.status(400).json({ success: false, error: "Phone number and bot name are required!" });
    }
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    const sessionId = generateSessionId(botName);
    console.log(`📡 Starting pairing for ${botName} (${cleanPhone}) → ${sessionId}`);

    await startSession(sessionId, botName, cleanPhone);

    return res.json({ success: true, sessionId, expiryIn: 120 });
  } catch (err) {
    console.error("Connect API Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// API 2: Poll Status
app.get('/api/status/:sessionId', (req, res) => {
  const session = activeSessions[req.params.sessionId];
  if (!session) return res.json({ status: 'expired' });
  if (session.status === 'connected') return res.json({ status: 'connected', sessionId: req.params.sessionId });
  if (session.error) return res.json({ status: 'error', error: session.error });
  if (Date.now() > session.expiry && !session.pairingCode) {
    delete activeSessions[req.params.sessionId];
    return res.json({ status: 'expired' });
  }
  return res.json({
    status: 'pairing',
    pairingCode: session.pairingCode,
    secondsLeft: Math.max(0, Math.floor((session.expiry - Date.now()) / 1000))
  });
});

// API 3: Setup form
app.post('/api/setup', async (req, res) => {
  try {
    const { sessionId, botName, ownerNumber, prefix, mode, alwaysOnline, welcome } = req.body;
    if (!sessionId) return res.status(400).json({ success: false, error: "Session ID is required!" });
    const updatedSettings = {
      botName: botName || "Empire MD",
      prefix: prefix || ".",
      mode: mode || "private",
      alwaysOnline: alwaysOnline === 'true' || alwaysOnline === true,
      welcome: welcome === 'true' || welcome === true,
      ownerNumber: ownerNumber ? ownerNumber.split(',').map(n => n.trim().replace(/[^0-9]/g, '')) : []
    };
    await updateSettings(sessionId, updatedSettings);
    return res.json({ success: true, message: "Configuration saved!" });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// API 4: Public directory
app.get('/api/public-directory', async (req, res) => {
  try {
    const bots = await getPublicBots();
    return res.json({ success: true, bots });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`🌐 Empire MD Web Onboarding Portal running on port ${PORT}`);
});

module.exports = { app, server };
