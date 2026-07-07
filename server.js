// Empire MD - Connection Server, Pairing Engine, & Onboarding Portal (PER-BOT OWNER + AUTO FEATURES + ADMIN)
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const {
  default: makeWASocket,
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

// IMPORT THE NEW DATABASE-BACKED AUTH STATE
const { useSupabaseAuthState } = require('./lib/useSupabaseAuthState');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const activeSessions = {};
const SESSIONS_ROOT = path.join(__dirname, 'sessions');

// CACHE FOR BAILEYS VERSION (Finding 2: Prevents 400 simultaneous outbound API requests on boot)
let cachedBaileysVersion = null;
async function getBaileysVersion() {
  if (cachedBaileysVersion) return cachedBaileysVersion;
  try {
    const { version } = await fetchLatestBaileysVersion();
    cachedBaileysVersion = version;
    console.log(`ℹ️ Cached latest Baileys version: ${version.join('.')}`);
    return version;
  } catch (err) {
    console.warn("⚠️ Failed to fetch latest Baileys version, using standard fallback:", err.message);
    return [2, 3000, 1]; // standard safe fallback
  }
}

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
  // best-effort wipe of disk credentials folder (if they exist)
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

// 🧽 Periodic cleanup: purge disk session folders that never completed pairing (fixes ENOSPC).
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
          console.log(`🧹 Purged orphan session folder ${name}`);
        } catch (_) {}
      }
    }
  } catch (e) {
    console.error("cleanupOrphanSessions error:", e.message);
  }
}

// Tracks reconnection attempts per-session for exponential backoff (Finding 3)
const reconnectAttempts = {};

async function startSession(sessionId, botName, cleanPhone) {
  // Finding 1: Swapped useMultiFileAuthState out for our scale-ready useSupabaseAuthState
  const { state, saveCreds } = await useSupabaseAuthState(sessionId);
  const version = await getBaileysVersion();

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
        delete reconnectAttempts[sessionId];
        try { await markBotOffline(sessionId); } catch (_) {}
        console.log(`🚪 Session ${sessionId} logged out and cleared.`);

      } else {
        // Finding 3: Exponential Backoff with Jitter Reconnect to prevent CPU/reconnect storms at 1000 bots
        const attempts = reconnectAttempts[sessionId] || 0;
        reconnectAttempts[sessionId] = attempts + 1;
        
        const delay = Math.min(2000 * Math.pow(2, attempts), 60000) + Math.floor(Math.random() * 3000);
        console.log(`🔄 Reconnecting ${sessionId} (reason ${reason}) in ${(delay / 1000).toFixed(1)}s (attempt ${attempts + 1})...`);
        
        const stillPairing = !sock.authState?.creds?.registered;
        setTimeout(() => {
          startSession(sessionId, botName, stillPairing ? cleanPhone : null);
        }, delay);
      }

    } else if (connection === 'open') {
      console.log(`✅ Session ${sessionId} connected!`);
      // Reset backoff attempts on successful connection
      delete reconnectAttempts[sessionId];

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

// 🔁 Global bridge so commands can trigger a new pairing session.
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

  const started = Date.now();
  while (Date.now() - started < 12000) {
    const s = activeSessions[sessionId];
    if (s?.pairingCode) return { ok: true, sessionId, code: s.pairingCode };
    if (s?.error) return { ok: false, error: s.error };
    await new Promise(r => setTimeout(r, 500));
  }
  return { ok: false, error: "Timed out generating the pairing code. Please try again." };
};

// 🔁 Staggered Boot Resume (Finding 5)
// Instead of scanning local file folders, we pull active bot sessions from the database
// and stagger their boot startups to prevent thundering herd CPU spikes on server restarts.
async function resumeSavedSessions() {
  try {
    const { getSettings } = require('./lib/database');
    const { createClient } = require('@supabase/supabase-js');
    
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
      console.log('ℹ️ Supabase not configured — skipping session resume.');
      return;
    }
    
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    
    // Select all registered session_ids that are not flagged as offline or deleted
    const { data: activeBots, error } = await supabase
      .from('bots')
      .select('session_id, bot_name')
      .eq('status', 'connected'); // only resume active ones
      
    if (error) throw error;

    if (!activeBots || activeBots.length === 0) {
      console.log('ℹ️ No saved bot sessions found to resume in database.');
      return;
    }

    console.log(`♻️ Found ${activeBots.length} active bot sessions to resume. Staggering startup...`);

    // Stagger starts (e.g., 1 bot every 1.5 seconds) so 400 bots boot beautifully
    let index = 0;
    for (const bot of activeBots) {
      const delay = index * 1500;
      setTimeout(async () => {
        try {
          console.log(`[RESUME] Booting session ${index + 1}/${activeBots.length}: ${bot.session_id}`);
          await startSession(bot.session_id, bot.bot_name || "Empire MD", null);
        } catch (err) {
          console.error(`[RESUME ERROR] Session ${bot.session_id} failed:`, err.message);
        }
      }, delay);
      index++;
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
    await killSession(sessionId);
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
