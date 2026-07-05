// Empire MD - Connection Server, Pairing Engine, & Onboarding Portal (PER-BOT OWNER + AUTO FEATURES + ADMIN)
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const config = require('./config');
const { handleMessage } = require('./lib/msgHandler');
const {
  registerBot,
  getPublicBots,
  getSettings,
  isBotNameTaken,
  incrementUsage,
  getTopUsageBots,
  getInactiveBots,
  flagAbusive,
  deleteBot,
  markBotOffline
} = require('./lib/database');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const activeSessions = {};
const SESSIONS_ROOT = path.join(__dirname, 'sessions');

// Random emoji pool for status reactions (matches auto.js)
const RANDOM_STATUS_EMOJIS = ["💖","🔥","😂","😍","👏","🎉","💯","👍","🙌","✨","😎","🥰","⚡","🌟","💪","👀","🤩","❤️","😮","🚀"];

function generateSessionId(botName) {
  const formattedName = botName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `BOTWAN_${formattedName}_${randomSuffix}`;
}

function isValidMsisdn(num) {
  return /^[1-9][0-9]{7,14}$/.test(num);
}

function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.adminKey;
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return res.status(403).json({ success: false, error: "Forbidden: admin access only." });
  }
  next();
}

async function killSession(sessionId) {
  const s = activeSessions[sessionId];
  if (s?.sock) {
    try { await s.sock.logout(); } catch (_) {}
    try { s.sock.end(); } catch (_) {}
  }
  delete activeSessions[sessionId];
  try { fs.rmSync(path.join(SESSIONS_ROOT, sessionId), { recursive: true, force: true }); } catch (_) {}
}

async function fetchThumb(url) {
  try {
    const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000 });
    return Buffer.from(r.data, 'binary');
  } catch (e) {
    console.error("Thumbnail fetch failed:", e.message);
    return undefined;
  }
}

// 🧽 Periodic cleanup: purge session folders that never completed pairing (fixes ENOSPC).
function cleanupOrphanSessions() {
  try {
    if (!fs.existsSync(SESSIONS_ROOT)) return;
    const now = Date.now();
    for (const name of fs.readdirSync(SESSIONS_ROOT)) {
      const dir = path.join(SESSIONS_ROOT, name);
      let stat;
      try { stat = fs.statSync(dir); } catch { continue; }
      if (!stat.isDirectory()) continue;

      const credsFile = path.join(dir, 'creds.json');
      const isActive = !!activeSessions[name]?.sock;
      const ageMin = (now - stat.mtimeMs) / 60000;

      if (!fs.existsSync(credsFile) && !isActive && ageMin > 15) {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
          console.log(`🧹 Purged orphan session ${name}`);
        } catch (_) {}
      }
    }
  } catch (e) {
    console.error("cleanupOrphanSessions error:", e.message);
  }
}

async function startSession(sessionId, botName, cleanPhone) {
  const sessionFolder = path.join(SESSIONS_ROOT, sessionId);

  if (cleanPhone) {
    const credsFile = path.join(sessionFolder, 'creds.json');
    if (!fs.existsSync(credsFile)) {
      try { fs.rmSync(sessionFolder, { recursive: true, force: true }); } catch (_) {}
    }
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: Browsers.ubuntu('Chrome'),
    syncFullHistory: false,
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true,
    keepAliveIntervalMs: 30000,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000
  });
  sock.sessionId = sessionId;

  if (cleanPhone) sock.ownerNumber = [cleanPhone];

  try {
    sock.botSettings = (await getSettings(sessionId)) || null;
  } catch (_) {
    sock.botSettings = null;
  }

  if (!activeSessions[sessionId]) {
    activeSessions[sessionId] = {
      botName, phoneNumber: cleanPhone, status: 'pairing',
      pairingCode: null, error: null, expiry: Date.now() + 120000
    };
  }
  activeSessions[sessionId].sock = sock;
  activeSessions[sessionId].saveCreds = saveCreds;

  sock.ev.on('creds.update', saveCreds);

  // ✅ STANDARD PAIRING-CODE REQUEST — fresh, unregistered sessions only, once.
  if (!sock.authState.creds.registered && cleanPhone && !sock._pairingRequested) {
    sock._pairingRequested = true;
    setTimeout(async () => {
      try {
        if (sock.authState.creds.registered) return;
        const code = await sock.requestPairingCode(cleanPhone);
        const formatted = code?.match(/.{1,4}/g)?.join('-') || code;
        if (activeSessions[sessionId]) {
          activeSessions[sessionId].pairingCode = formatted;
          activeSessions[sessionId].error = null;
        }
        console.log(`🔑 Pairing code for ${sessionId}: ${formatted}`);
      } catch (err) {
        console.error("Error requesting pairing code:", err?.message || err);
        if (activeSessions[sessionId]) {
          activeSessions[sessionId].error = "Failed to generate code. Please try again.";
        }
      }
    }, 3000);
  }

  // 📩 MESSAGE LISTENER
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const mek of messages) {
      if (!mek.message) continue;

      // 🟢 STATUS HANDLING — before the status skip
      if (mek.key && mek.key.remoteJid === 'status@broadcast') {
        try {
          if (!mek.key.fromMe) {
            let s = sock.botSettings;
            if (!s && sock.sessionId) {
              try { s = await getSettings(sock.sessionId); sock.botSettings = s; } catch (_) {}
            }
            s = s || config.settings;

            if (s.autostatusview || s.autostatusreact) {
              try { await sock.readMessages([mek.key]); } catch (_) {}
            }

            if (s.autostatusreact && mek.key.participant) {
              // random emoji unless a fixed one is set
              const emoji = s.defaultStatusEmoji ||
                RANDOM_STATUS_EMOJIS[Math.floor(Math.random() * RANDOM_STATUS_EMOJIS.length)];
              try {
                const statusKey = {
                  remoteJid: 'status@broadcast',
                  id: mek.key.id,
                  participant: mek.key.participant,
                  fromMe: false
                };
                await sock.sendMessage(
                  'status@broadcast',
                  { react: { text: emoji, key: statusKey } },
                  { statusJidList: [mek.key.participant] }
                );
                console.log(`[STATUS REACT] ${emoji} → ${mek.key.participant}`);
              } catch (reactErr) {
                console.error("Status react failed:", reactErr.message);
              }
            }
          }
        } catch (e) {
          console.error("Status auto-handler error:", e.message);
        }
        continue;
      }

      if (sock.sessionId) {
        incrementUsage(sock.sessionId).catch(() => {});
      }

      try {
        await handleMessage(sock, mek);
      } catch (err) {
        console.error("handleMessage error:", err);
      }
    }
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log(`🔌 Closed for ${sessionId}. Reason: ${reason}`);

      if (reason === DisconnectReason.loggedOut) {
        delete activeSessions[sessionId];
        try { fs.rmSync(sessionFolder, { recursive: true, force: true }); } catch (_) {}
        try { await markBotOffline(sessionId); } catch (_) {}
        console.log(`🚪 Session ${sessionId} logged out and cleared.`);

      } else if (reason === DisconnectReason.restartRequired || reason === 515) {
        console.log(`♻️ Restart required for ${sessionId} — reconnecting to complete login...`);
        setTimeout(() => startSession(sessionId, botName, cleanPhone), 1500);

      } else {
        console.log(`🔄 Reconnecting ${sessionId} (reason ${reason})...`);
        const stillPairing = !sock.authState?.creds?.registered;
        setTimeout(() => startSession(sessionId, botName, stillPairing ? cleanPhone : null), 2000);
      }

    } else if (connection === 'open') {
      console.log(`✅ Session ${sessionId} connected!`);
      if (activeSessions[sessionId]) activeSessions[sessionId].status = 'connected';

      const connectedNumber = sock.user.id.split(':')[0];

      if (!sock.ownerNumber || !sock.ownerNumber.length) {
        sock.ownerNumber = [connectedNumber];
      }

      try {
        const latest = await getSettings(sessionId);
        if (latest) sock.botSettings = latest;
      } catch (_) {}

      try {
        const s = sock.botSettings || config.settings;
        if (s.alwaysOnline) await sock.sendPresenceUpdate('available');
      } catch (_) {}

      const ownerForBot = cleanPhone || connectedNumber;

      const channelUrl = "https://whatsapp.com/channel/0029VaI3OXiF6smuq5LxxN15";
      const cardTitle   = "BOT-WAN MD V 1.0---The Future is NOW";
      const cardBody    = "The future of is NOW.";
      const cardLink    = "https://whatsapp.com/channel/0029VaI3OXiF6smuq5LxxN15";
      const thumbUrl    = "https://i.ibb.co/8LMKhwqt/download.jpg";

      const welcomeDm =
` *Welcome  ${botName}!* 

BOT-WAN is connected and ready to function. Your WhatsApp bot is connected and registered.
🆔 *Session ID:* ${sessionId}

🔮 Enjoy fast downloads, stickers, and smart moderation.

📢 *Join our official channel:*
👉 ${channelUrl}

_Type .help in any chat to view your commands!_`;

      if (cleanPhone && !sock._welcomeSent) {
        sock._welcomeSent = true;

        try {
          const result = await registerBot(sessionId, botName, cleanPhone, ownerForBot);
          if (result && result.ok === false && result.code === '23505') {
            console.warn(`⚠️ Duplicate bot name on register for ${sessionId}; killing session.`);
            try {
              const dupJid = connectedNumber + '@s.whatsapp.net';
              await sock.sendMessage(dupJid, {
                text: `⚠️ The bot name *${botName}* is already taken. Please reconnect with a different name.`
              });
            } catch (_) {}
            await killSession(sessionId);
            return;
          }
          try { sock.botSettings = await getSettings(sessionId); } catch (_) {}
        } catch (dbErr) {
          console.error("registerBot error:", dbErr.message);
        }

        setTimeout(async () => {
          const ownerJid = connectedNumber + '@s.whatsapp.net';
          try {
            const thumb = await fetchThumb(thumbUrl);
            await sock.sendMessage(ownerJid, {
              text: welcomeDm,
              contextInfo: {
                externalAdReply: {
                  title: cardTitle,
                  body: cardBody,
                  mediaType: 1,
                  renderLargerThumbnail: true,
                  thumbnail: thumb,
                  sourceUrl: cardLink,
                  showAdAttribution: false
                }
              }
            });
            console.log(`📨 Welcome DM sent to ${ownerJid}`);
          } catch (dmErr) {
            console.error("Failed to send welcome DM:", dmErr.message);
            try {
              await sock.sendMessage(ownerJid, { text: welcomeDm });
              console.log(`📨 Welcome DM (plain fallback) sent to ${ownerJid}`);
            } catch (e2) {
              console.error("Welcome DM plain fallback also failed:", e2.message);
            }
          }
        }, 5000);
      }
    }
  });

  return sock;
}

// 🔗 Global bridge so commands (e.g. .pair) can trigger a new pairing session.
global.startPairingSession = async function (botName, cleanPhone) {
  if (!isValidMsisdn(cleanPhone)) {
    return { ok: false, error: "Invalid number. Use full international format, no + or leading zero (e.g. 2347012345678)." };
  }
  if (await isBotNameTaken(botName)) {
    return { ok: false, error: `The bot name "${botName}" is already taken. Choose another.` };
  }

  const sessionId = generateSessionId(botName);
  try {
    await startSession(sessionId, botName, cleanPhone);
  } catch (err) {
    if (err.code === 'ENOSPC') return { ok: false, error: "Server storage is full. Try again shortly." };
    return { ok: false, error: err.message };
  }

  // Wait briefly for requestPairingCode (fires ~3s after socket start).
  const started = Date.now();
  while (Date.now() - started < 12000) {
    const s = activeSessions[sessionId];
    if (s?.pairingCode) return { ok: true, sessionId, code: s.pairingCode };
    if (s?.error) return { ok: false, error: s.error };
    await new Promise(r => setTimeout(r, 500));
  }
  return { ok: false, error: "Timed out generating the pairing code. Please try again." };
};


async function resumeSavedSessions() {
  try {
    if (!fs.existsSync(SESSIONS_ROOT)) {
      console.log('ℹ️ No sessions folder yet — nothing to resume.');
      return;
    }
    const folders = fs.readdirSync(SESSIONS_ROOT, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .filter(name => name.startsWith('BOTWAN_'));

    if (folders.length === 0) {
      console.log('ℹ️ No saved bot sessions to resume yet.');
      return;
    }

    for (const sessionId of folders) {
      const credsFile = path.join(SESSIONS_ROOT, sessionId, 'creds.json');
      if (!fs.existsSync(credsFile)) {
        console.log(`⏭️ Skipping ${sessionId} — no creds, not a completed pairing.`);
        continue;
      }

      // 🔑 Verify session status against Supabase before resuming
      try {
        const settings = await getSettings(sessionId);
        // If settings read fails, or return value doesn't have required parameters, we check if it is active.
        // We will only resume if a row exists in Supabase.
        if (!settings || Object.keys(settings).length === 0) {
          console.log(`🧹 Purging orphan session ${sessionId} — not found or deleted in Supabase.`);
          try { fs.rmSync(path.join(SESSIONS_ROOT, sessionId), { recursive: true, force: true }); } catch (_) {}
          continue;
        }
        
        console.log(`♻️ Resuming saved session: ${sessionId}`);
        await startSession(sessionId, settings.botName || config.botName || "Empire MD", null);
      } catch (dbErr) {
        console.error(`Error verifying session ${sessionId} on resume:`, dbErr.message);
        // Fail-safe: if DB lookup fails, still try to resume, but log error
        await startSession(sessionId, config.botName || "Empire MD", null);
      }
    }
  } catch (err) {
    console.error("resumeSavedSessions error:", err);
  }
}

// API 1: Request Pairing Code
app.post('/api/connect', async (req, res) => {
  try {
    const { phoneNumber, botName } = req.body;
    if (!phoneNumber || !botName) {
      return res.status(400).json({ success: false, error: "Phone number and bot name are required!" });
    }

    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');

    if (!isValidMsisdn(cleanPhone)) {
      return res.status(400).json({
        success: false,
        error: "Invalid number. Use full international format with country code and no leading zero (e.g. 2347012345678)."
      });
    }

    if (await isBotNameTaken(botName)) {
      return res.status(409).json({
        success: false,
        error: `The bot name "${botName}" is already taken. Please choose another.`
      });
    }

    const sessionId = generateSessionId(botName);
    console.log(`📡 Pairing for ${botName} (${cleanPhone}) → ${sessionId}`);

    try {
      await startSession(sessionId, botName, cleanPhone);
    } catch (err) {
      if (err.code === 'ENOSPC') {
        return res.status(507).json({ success: false, error: "Server storage is full. Please try again shortly." });
      }
      throw err;
    }

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

// API 3: Public directory - Hide session IDs
app.get('/api/public-directory', async (req, res) => {
  try {
    const bots = await getPublicBots();
    const safeBots = bots.map(bot => ({
      bot_name: bot.bot_name || "Empire Bot",
      phone_number: bot.phone_number ? bot.phone_number.slice(0, 5) + "****" + bot.phone_number.slice(-2) : "Unknown",
      status: bot.status || "offline",
      created_at: bot.created_at
    }));
    return res.json({ success: true, bots: safeBots });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// 🔐 ADMIN API — owner-only (requires x-admin-key header / ?adminKey=)
// ──────────────────────────────────────────────────────────────

app.get('/api/admin/usage', requireAdmin, async (req, res) => {
  try {
    const bots = await getTopUsageBots(Number(req.query.limit) || 20);
    return res.json({ success: true, bots });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/inactive', requireAdmin, async (req, res) => {
  try {
    const bots = await getInactiveBots(Number(req.query.days) || 7);
    return res.json({ success: true, bots });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/flag/:sessionId', requireAdmin, async (req, res) => {
  try {
    const value = req.body && req.body.value === false ? false : true;
    await flagAbusive(req.params.sessionId, value);
    const live = activeSessions[req.params.sessionId]?.sock;
    if (live) live.isAbusive = value;
    return res.json({ success: true, message: `Bot ${value ? 'flagged as abusive' : 'unflagged'}.` });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/admin/bot/:sessionId', requireAdmin, async (req, res) => {
  try {
    const { sessionId } = req.params;
    // 1. Fully kill/disconnect the live WhatsApp socket and delete its session folder from disk
    await killSession(sessionId);
    // 2. Remove the bot record completely from Supabase to prevent resurrection on restart
    await deleteBot(sessionId);
    return res.json({ success: true, message: `Bot ${sessionId} has been permanently deleted and credentials wiped.` });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/cleanup', requireAdmin, (req, res) => {
  cleanupOrphanSessions();
  return res.json({ success: true, message: "Orphan session cleanup executed." });
});

server.listen(PORT, () => {
  console.log(`🌐 Empire MD Web Onboarding Portal running on port ${PORT}`);
  cleanupOrphanSessions();
  setInterval(cleanupOrphanSessions, 60 * 60 * 1000);
  resumeSavedSessions();
});

module.exports = { app, server };
