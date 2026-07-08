// Empire MD - Connection Server, Pairing Engine, & Onboarding Portal (PER-BOT OWNER + PER-BOT AUTO SETTINGS + ADMIN)
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { execSync } = require('child_process'); // 🆕 for disk capacity checks
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
  updateSettings,
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

// 🚦 EMERGENCY SWITCH — when true, /api/connect politely refuses NEW pairings.
// Existing bots are never affected. Toggled from the admin dashboard.
let pairingPaused = false;

// Reserve threshold: warn/act when the volume is this % full (keep 10% free).
const RESERVE_PERCENT = 10;
const DISK_ALERT_AT = 100 - RESERVE_PERCENT; // 90

// 💾 Disk status for the volume that holds the sessions folder.
function getDiskStatus() {
  try {
    const out = execSync(`df -Pm "${SESSIONS_ROOT}"`).toString().trim().split('\n')[1];
    const cols = out.split(/\s+/);
    return {
      usePercent: Number(cols[4].replace('%', '')),
      availMB: Number(cols[3]),
      totalMB: Number(cols[1])
    };
  } catch (_) {
    // Fail-open: if the check errors, don't block the whole service.
    return { usePercent: 0, availMB: Infinity, totalMB: Infinity };
  }
}

function generateSessionId(botName) {
  const formattedName = botName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `BOTWAN_${formattedName}_${randomSuffix}`;
}

// 🔐 Owner-only gate — only the repo owner who holds ADMIN_KEY can pass.
function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.adminKey;
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return res.status(403).json({ success: false, error: "Forbidden: admin access only." });
  }
  next();
}

// 🧹 Fully terminate a live session (logout + end socket) before removing it.
async function killSession(sessionId) {
  const s = activeSessions[sessionId];
  if (s?.sock) {
    try { await s.sock.logout(); } catch (_) {}
    try { s.sock.end(); } catch (_) {}
  }
  delete activeSessions[sessionId];
  // best-effort wipe of the auth folder on disk
  try { fs.rmSync(path.join(SESSIONS_ROOT, sessionId), { recursive: true, force: true }); } catch (_) {}
}

// 🖼️ Fetch an image URL as a Buffer so externalAdReply thumbnails always render.
async function fetchThumb(url) {
  try {
    const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000 });
    return Buffer.from(r.data, 'binary');
  } catch (e) {
    console.error("Thumbnail fetch failed:", e.message);
    return undefined; // message still sends without the image
  }
}

// Reusable connection routine so we can actually reconnect
async function startSession(sessionId, botName, cleanPhone) {
  const sessionFolder = path.join(SESSIONS_ROOT, sessionId);
  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: Browsers.ubuntu('Chrome') // correct browser for pairing-code flow
  });
  sock.sessionId = sessionId;

  // 🔑 OWNER TAG: on a fresh pairing, the typed phone IS the owner of this bot.
  if (cleanPhone) sock.ownerNumber = [cleanPhone];

  // 🗂️ Warm the per-bot settings cache so the status handler reads THIS bot's prefs.
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

  // 📩 MESSAGE LISTENER — routes incoming messages to the command handler
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const mek of messages) {
      if (!mek.message) continue;

      // 🟢 STATUS HANDLING — must run BEFORE the status skip
      if (mek.key && mek.key.remoteJid === 'status@broadcast') {
        try {
          if (!mek.key.fromMe) {
            // Per-bot settings: live cache → DB → global defaults
            let s = sock.botSettings;
            if (!s && sock.sessionId) {
              try { s = await getSettings(sock.sessionId); sock.botSettings = s; } catch (_) {}
            }
            s = s || config.settings;

            // 👁️ Auto-view statuses
            if (s.autostatusview) {
              await sock.readMessages([mek.key]);
            }
            // 💖 Auto-react to statuses
            if (s.autostatusreact && mek.key.participant) {
              const emoji = s.defaultStatusEmoji || "💖";
              try {
                await sock.sendMessage(
                  'status@broadcast',
                  { react: { text: emoji, key: mek.key } },
                  { statusJidList: [mek.key.participant] }
                );
              } catch (reactErr) {
                console.error("Status react failed:", reactErr.message);
              }
            }
          }
        } catch (e) {
          console.error("Status auto-handler error:", e.message);
        }
        continue; // done with status; never pass it to the command handler
      }

      // 📊 USAGE TRACKING — count every real (non-status) message for this bot.
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

  // Only request a pairing code when NOT registered AND we have a phone number (fresh pairing)
  if (!sock.authState.creds.registered && cleanPhone) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(cleanPhone);
        if (activeSessions[sessionId]) {
          activeSessions[sessionId].pairingCode = code?.match(/.{1,4}/g)?.join('-') || code;
        }
        console.log(`🔑 Pairing code for ${sessionId}: ${code}`);
      } catch (err) {
        console.error("Error requesting pairing code:", err);
        if (activeSessions[sessionId]) {
          activeSessions[sessionId].error = "Failed to generate code. Try again.";
        }
      }
    }, 4000);
  }

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
      } else {
        console.log(`🔄 Reconnecting ${sessionId}...`);
        setTimeout(() => startSession(sessionId, botName, cleanPhone), 2000);
      }
    } else if (connection === 'open') {
      console.log(`✅ Session ${sessionId} connected!`);
      if (activeSessions[sessionId]) activeSessions[sessionId].status = 'connected';

      const connectedNumber = sock.user.id.split(':')[0];

      // 🔑 Guarantee this bot always has an owner = the pairing/connected number.
      if (!sock.ownerNumber || !sock.ownerNumber.length) {
        sock.ownerNumber = [connectedNumber];
      }

      // 🗂️ Refresh the per-bot settings cache now that we're connected.
      try {
        const latest = await getSettings(sessionId);
        if (latest) sock.botSettings = latest;
      } catch (_) {}

      // ⚡ Apply always-online presence per-bot if enabled.
      try {
        const s = sock.botSettings || config.settings;
        if (s.alwaysOnline) await sock.sendPresenceUpdate('available');
      } catch (_) {}

      const ownerForBot = cleanPhone || connectedNumber;
      const ownerJid = ownerForBot + '@s.whatsapp.net';

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

      // Only send the welcome DM + register on a FRESH pairing (when we have the phone number)
      if (cleanPhone) {
        // Register FIRST so the bot appears in the directory/admin immediately.
        try {
          const result = await registerBot(sessionId, botName, cleanPhone, ownerForBot);
          if (result && result.ok === false && result.code === '23505') {
            console.warn(`⚠️ Duplicate bot name on register for ${sessionId}; killing session.`);
            try {
              await sock.sendMessage(ownerJid, {
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

        // Delay the welcome DM so Baileys finishes session/contact sync.
        setTimeout(async () => {
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
            console.log(`📩 Welcome DM (card) sent to ${ownerJid}`);
          } catch (dmErr) {
            console.error("Welcome DM (card) failed, retrying plain:", dmErr.message);
            try {
              await sock.sendMessage(ownerJid, { text: welcomeDm });
              console.log(`📩 Welcome DM (plain) sent to ${ownerJid}`);
            } catch (e2) {
              console.error("Welcome DM (plain) also failed:", e2.message);
            }
          }
        }, 5000);
      }
    }
  });

  return sock;
}

// 🔁 On boot, resume any REAL sessions saved on the volume (so bots survive redeploys)
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
      console.log(`♻️ Resuming saved session: ${sessionId}`);
      await startSession(sessionId, config.botName || "Empire MD", null);
    }
  } catch (err) {
    console.error("resumeSavedSessions error:", err);
  }
}

// API 1: Request Pairing Code
app.post('/api/connect', async (req, res) => {
  try {
    // 🚦 EMERGENCY CAGE — refuse new pairings when paused (manual or auto).
    const disk = getDiskStatus();
    if (pairingPaused || disk.usePercent >= DISK_ALERT_AT) {
      console.warn(`⛔ Pairing refused — paused:${pairingPaused} disk:${disk.usePercent}%`);
      return res.status(503).json({
        success: false,
        error: "🚧 We're preparing a second server to handle demand. New bot pairing is paused for a few minutes — please try again shortly. Existing bots are unaffected."
      });
    }

    const { phoneNumber, botName } = req.body;
    if (!phoneNumber || !botName) {
      return res.status(400).json({ success: false, error: "Phone number and bot name are required!" });
    }

    // 🚫 DUPLICATE-NAME GUARD — block before we ever build a socket.
    if (await isBotNameTaken(botName)) {
      return res.status(409).json({
        success: false,
        error: `The bot name "${botName}" is already taken. Please choose another.`
      });
    }

    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    const sessionId = generateSessionId(botName);
    console.log(`📡 Pairing for ${botName} (${cleanPhone}) → ${sessionId}`);

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

// API 3: Setup
app.post('/api/setup', async (req, res) => {
  try {
    const {
      sessionId, botName, ownerNumber, prefix, mode, alwaysOnline, welcome,
      autostatusview, autostatusreact, auttyping, autorecord, defaultStatusEmoji
    } = req.body;
    if (!sessionId) return res.status(400).json({ success: false, error: "Session ID is required!" });

    const fallbackOwner = activeSessions[sessionId]?.phoneNumber
      ? [activeSessions[sessionId].phoneNumber]
      : [];

    const ownerList = ownerNumber
      ? ownerNumber.split(',').map(n => n.trim().replace(/[^0-9]/g, '')).filter(Boolean)
      : [];

    const truthy = (v) => v === 'true' || v === true || v === 'on';

    const updatedSettings = {
      botName: botName || "Empire MD",
      prefix: prefix || ".",
      mode: mode || "private",
      alwaysOnline: truthy(alwaysOnline),
      welcome: truthy(welcome),
      ownerNumber: ownerList.length ? ownerList : fallbackOwner,
      autostatusview: truthy(autostatusview),
      autostatusreact: truthy(autostatusreact),
      auttyping: truthy(auttyping),
      autorecord: truthy(autorecord),
      defaultStatusEmoji: defaultStatusEmoji || "💖"
    };

    await updateSettings(sessionId, updatedSettings);

    const liveSock = activeSessions[sessionId]?.sock;
    if (liveSock) {
      if (updatedSettings.ownerNumber.length) liveSock.ownerNumber = updatedSettings.ownerNumber;
      liveSock.botSettings = { ...(liveSock.botSettings || {}), ...updatedSettings };
    }

    return res.json({ success: true, message: "Configuration saved!" });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// API 4: Public directory - Hide session IDs
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

// 🆕 📊 SERVER CAPACITY STATUS — disk usage + pause state + bot count
app.get('/api/admin/status', requireAdmin, (req, res) => {
  const disk = getDiskStatus();
  res.json({
    success: true,
    disk,
    pairingPaused,
    activeBots: Object.keys(activeSessions).length,
    reserveThreshold: DISK_ALERT_AT
  });
});

// 🆕 🚦 TOGGLE emergency pause on/off
app.post('/api/admin/pause', requireAdmin, (req, res) => {
  pairingPaused = req.body?.paused === true || req.body?.paused === 'true';
  console.log(`🚦 Pairing ${pairingPaused ? 'PAUSED (emergency mode)' : 'RESUMED'}`);
  res.json({ success: true, pairingPaused });
});

// 📊 High-volume usage leaderboard
app.get('/api/admin/usage', requireAdmin, async (req, res) => {
  try {
    const bots = await getTopUsageBots(Number(req.query.limit) || 20);
    return res.json({ success: true, bots });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 💤 List inactive bots (no activity in N days, default 7)
app.get('/api/admin/inactive', requireAdmin, async (req, res) => {
  try {
    const bots = await getInactiveBots(Number(req.query.days) || 7);
    return res.json({ success: true, bots });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 🚩 Flag (or unflag) a bot as abusive
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

// 🗑️ Delete an inactive / abusive bot (kills live socket, then removes the row)
app.delete('/api/admin/bot/:sessionId', requireAdmin, async (req, res) => {
  try {
    const { sessionId } = req.params;
    await killSession(sessionId);
    await deleteBot(sessionId);
    return res.json({ success: true, message: `Bot ${sessionId} deleted.` });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`🌐 Empire MD Web Onboarding Portal running on port ${PORT}`);
  resumeSavedSessions();
});

module.exports = { app, server };
