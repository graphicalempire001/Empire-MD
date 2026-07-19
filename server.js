const express = require('express'); // 🟢 Move imports to the top
const compression = require('compression');
const http = require('http');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { execSync } = require('child_process'); 
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

const app = express(); // 🟢 Only declare this ONCE
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(compression()); // 🟢 Gzip compression for mobile speed
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the compiled React Frontend app
app.use(express.static(path.join(__dirname, 'public/Frontend/dist')));

const activeSessions = {};
const SESSIONS_ROOT = path.join(__dirname, 'sessions');

// 🚦 EMERGENCY SWITCH
let pairingPaused = false;

// Reserve threshold: warn/act when the volume is this % full (keep 10% free).
const RESERVE_PERCENT = 10;
const DISK_ALERT_AT = 100 - RESERVE_PERCENT; // 90

// 🎲 Neutral (non-emotional) emoji pool for auto-status reactions.
const NEUTRAL_STATUS_EMOJIS = ['🗿', '🤖', '💻', '⚙️', '📦', '📁', '🗒️', '🪙', '🔌', '🛸', '🧊', '🫧', '🔔', '✨', '⚡', '☕', '🔎', '🛡️', '🔑', '📟'];
function randomNeutralEmoji() {
  return NEUTRAL_STATUS_EMOJIS[Math.floor(Math.random() * NEUTRAL_STATUS_EMOJIS.length)];
}

// 🗃️ ANTIDELETE — rolling in-memory cache of recent messages, per session.
const messageCache = {}; // { [sessionId]: Map(messageId -> {mek, chatJid, sender, ts}) }
const MSG_CACHE_LIMIT = 400;
function cacheMessage(sessionId, mek) {
  if (!sessionId || !mek?.key?.id) return;
  if (!messageCache[sessionId]) messageCache[sessionId] = new Map();
  const store = messageCache[sessionId];
  store.set(mek.key.id, {
    mek,
    chatJid: mek.key.remoteJid,
    sender: mek.key.participant || mek.key.remoteJid,
    ts: Date.now()
  });
  if (store.size > MSG_CACHE_LIMIT) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
}
// Normalize antidelete setting → 'off' | 'chat' | 'dm'
// (config.js ships antidelete:true, so true means "restore in same chat").
function normalizeAntidelete(v) {
  if (v === true || v === 'true' || v === 'on' || v === 'chat') return 'chat';
  if (v === 'dm') return 'dm';
  return 'off';
}

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

// ✅ Validate a full international MSISDN (no + and no leading zero).
function isValidMsisdn(num) {
  return /^[1-9][0-9]{7,14}$/.test(num);
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
  delete messageCache[sessionId];
  try { fs.rmSync(path.join(SESSIONS_ROOT, sessionId), { recursive: true, force: true }); } catch (_) {}
}

// 🖼️ Fetch an image URL as a Buffer so externalAdReply thumbnails always render.
async function fetchThumb(url) {
  try {
    const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000 });
    return Buffer.from(r.data, 'binary');
  } catch (e) {
    console.error("Thumbnail fetch failed:", e.message);
    return undefined;
  }
}

// 🔁 Robust pairing-code request with retries (fixes phones that previously failed).
async function requestPairingCodeWithRetry(sock, cleanPhone, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const code = await sock.requestPairingCode(cleanPhone);
      if (code) return code;
    } catch (err) {
      lastErr = err;
      console.error(`Pairing code attempt ${i + 1} failed:`, err.message);
    }
    await new Promise(r => setTimeout(r, 2500 * (i + 1))); // backoff
  }
  throw lastErr || new Error("Could not generate pairing code.");
}

// Reusable connection routine.
// mode: 'pair' (default) requests a pairing code; 'qr' emits a QR string instead.
async function startSession(sessionId, botName, cleanPhone, mode = 'pair') {
  const sessionFolder = path.join(SESSIONS_ROOT, sessionId);
  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: Browsers.ubuntu('Chrome'),
    // 🔧 Robustness tuning so weaker phones/networks connect reliably
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 15000,
    retryRequestDelayMs: 2000,
    defaultQueryTimeoutMs: undefined,
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true,
    syncFullHistory: false
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
      pairingCode: null, qr: null, mode, error: null,
      codeRequested: false, expiry: Date.now() + 120000
    };
  }
  activeSessions[sessionId].sock = sock;
  activeSessions[sessionId].saveCreds = saveCreds;
  activeSessions[sessionId].mode = mode;

  sock.ev.on('creds.update', saveCreds);

  // 📩 MESSAGE LISTENER
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const mek of messages) {
      if (!mek.message) continue;

      // 🗃️ ANTIDELETE — catch revokes, otherwise cache the message.
      const proto = mek.message?.protocolMessage;
      if (proto && proto.type === 0 /* REVOKE */) {
        try {
          let s = sock.botSettings;
          if (!s && sock.sessionId) {
            try { s = await getSettings(sock.sessionId); sock.botSettings = s; } catch (_) {}
          }
          s = s || config.settings || {};
          const antidelete = normalizeAntidelete(s.antidelete);
          if (antidelete !== 'off') {
            const delId = proto.key?.id;
            const cached = delId && messageCache[sock.sessionId]?.get(delId);
            if (cached && !cached.mek.key.fromMe) {
              const ownerJid = (sock.ownerNumber?.[0] || sock.user.id.split(':')[0]) + '@s.whatsapp.net';
              const destination = antidelete === 'dm' ? ownerJid : cached.chatJid;
              const who = cached.sender.split('@')[0];
              const header =
                `🗑️ *Antidelete — recovered message*\n` +
                `👤 *From:* @${who}\n` +
                `💬 *Chat:* ${cached.chatJid.endsWith('@g.us') ? 'Group' : 'Private'}`;
              try {
                await sock.sendMessage(destination, { text: header, mentions: [cached.sender] });
                await sock.sendMessage(destination, { forward: cached.mek });
              } catch (fwdErr) {
                console.error("Antidelete forward failed:", fwdErr.message);
              }
            }
          }
        } catch (e) {
          console.error("Antidelete handler error:", e.message);
        }
        continue; // never process a revoke as a normal message
      } else {
        cacheMessage(sock.sessionId, mek);
      }

      // 🟢 STATUS HANDLING — must run BEFORE the status skip
      if (mek.key && mek.key.remoteJid === 'status@broadcast') {
        try {
          if (!mek.key.fromMe) {
            let s = sock.botSettings;
            if (!s && sock.sessionId) {
              try { s = await getSettings(sock.sessionId); sock.botSettings = s; } catch (_) {}
            }
            s = s || config.settings;
            // 👁️ Auto-view statuses
            if (s.autostatusview) {
              await sock.readMessages([mek.key]);
            }
            // 💠 Auto-react with a RANDOM NEUTRAL emoji
            if (s.autostatusreact && mek.key.participant) {
              const emoji = randomNeutralEmoji();
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
        continue;
      }

      // 📊 USAGE TRACKING
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

  // 🔑 PAIRING-CODE FLOW — request the code exactly ONCE (fixes double code).
  if (mode === 'pair' && !sock.authState.creds.registered && cleanPhone) {
    if (!activeSessions[sessionId].codeRequested) {
      activeSessions[sessionId].codeRequested = true; // guard against duplicates
      setTimeout(async () => {
        try {
          const code = await requestPairingCodeWithRetry(sock, cleanPhone, 3);
          if (activeSessions[sessionId]) {
            activeSessions[sessionId].pairingCode = code?.match(/.{1,4}/g)?.join('-') || code;
          }
          console.log(`🔑 Pairing code for ${sessionId}: ${code}`);
        } catch (err) {
          console.error("Error requesting pairing code:", err.message);
          if (activeSessions[sessionId]) {
            activeSessions[sessionId].error = "Failed to generate code. Try again.";
            activeSessions[sessionId].codeRequested = false; // allow a fresh retry
          }
        }
      }, 4000);
    }
  }

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // 📷 QR FLOW — capture the QR string for iPhone/QR users.
    if (qr && activeSessions[sessionId]) {
      activeSessions[sessionId].qr = qr;
      if (activeSessions[sessionId].mode === 'qr') {
        console.log(`📷 QR generated for ${sessionId}`);
      }
    }

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log(`🔌 Closed for ${sessionId}. Reason: ${reason}`);
      if (reason === DisconnectReason.loggedOut) {
        delete activeSessions[sessionId];
        delete messageCache[sessionId];
        try { fs.rmSync(sessionFolder, { recursive: true, force: true }); } catch (_) {}
        try { await markBotOffline(sessionId); } catch (_) {}
        console.log(`🚪 Session ${sessionId} logged out and cleared.`);
      } else {
        console.log(`🔄 Reconnecting ${sessionId}...`);
        setTimeout(() => startSession(sessionId, botName, cleanPhone, mode), 2000);
      }
    } else if (connection === 'open') {
      console.log(`✅ Session ${sessionId} connected!`);
      if (activeSessions[sessionId]) {
        activeSessions[sessionId].status = 'connected';
        activeSessions[sessionId].qr = null; // clear QR once connected
      }
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
      const ownerJid = ownerForBot + '@s.whatsapp.net';

      // De-hardcoded: pull branding from config with safe fallbacks.
      const channelUrl = config.channelUrl || "https://whatsapp.com/channel/0029VaI3OXiF6smuq5LxxN15";
      const cardTitle = `${config.botName || "Empire MD"} — Connected`;
      const cardBody = config.channelName || "Empire MD";
      const cardLink = channelUrl;
      const thumbUrl = config.channelThumb || "https://i.ibb.co/8LMKhwqt/download.jpg";

      const welcomeDm =
`*Welcome ${botName}!*
${config.botName || "Empire MD"} is connected and ready. Your WhatsApp bot is connected and registered.
🆔 *Session ID:* ${sessionId}
🔮 Enjoy fast downloads, stickers, and smart moderation.
📢 *Join our official channel:*
👉 ${channelUrl}
_Type .help in any chat to view your commands!_`;

      // Only register + welcome on a FRESH connection (fresh phone pairing OR fresh QR link).
      if (cleanPhone || activeSessions[sessionId]?.mode === 'qr') {
        try {
          const result = await registerBot(sessionId, botName, ownerForBot, ownerForBot);
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

// 🔁 Global bridge for the .pair command (pairing code).
global.startPairingSession = async function (botName, cleanPhone) {
  if (!isValidMsisdn(cleanPhone)) {
    return { ok: false, error: "Invalid number. Use full international format, no + or leading zero (e.g. 2347012345678)." };
  }
  if (await isBotNameTaken(botName)) {
    return { ok: false, error: `The bot name "${botName}" is already taken. Choose another.` };
  }
  const sessionId = generateSessionId(botName);
  try {
    await startSession(sessionId, botName, cleanPhone, 'pair');
  } catch (err) {
    if (err.code === 'ENOSPC') return { ok: false, error: "Server storage is full. Try again shortly." };
    return { ok: false, error: err.message };
  }
  const started = Date.now();
  while (Date.now() - started < 15000) {
    const s = activeSessions[sessionId];
    if (s?.pairingCode) return { ok: true, sessionId, code: s.pairingCode };
    if (s?.error) return { ok: false, error: s.error };
    await new Promise(r => setTimeout(r, 500));
  }
  return { ok: false, error: "Timed out generating the pairing code. Please try again." };
};

// 🔁 Global bridge for the .qr command (QR code string).
global.startQRSession = async function (botName) {
  if (await isBotNameTaken(botName)) {
    return { ok: false, error: `The bot name "${botName}" is already taken. Choose another.` };
  }
  const sessionId = generateSessionId(botName);
  try {
    await startSession(sessionId, botName, null, 'qr');
  } catch (err) {
    if (err.code === 'ENOSPC') return { ok: false, error: "Server storage is full. Try again shortly." };
    return { ok: false, error: err.message };
  }
  const started = Date.now();
  while (Date.now() - started < 20000) {
    const s = activeSessions[sessionId];
    if (s?.qr) return { ok: true, sessionId, qr: s.qr };
    if (s?.error) return { ok: false, error: s.error };
    await new Promise(r => setTimeout(r, 500));
  }
  return { ok: false, error: "Timed out generating the QR code. Please try again." };
};

// 🔁 On boot, resume any REAL sessions saved on the volume
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
      await startSession(sessionId, config.botName || "Empire MD", null, 'pair');
    }
  } catch (err) {
    console.error("resumeSavedSessions error:", err);
  }
}

// API 1: Request Pairing Code
app.post('/api/connect', async (req, res) => {
  try {
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
    if (await isBotNameTaken(botName)) {
      return res.status(409).json({
        success: false,
        error: `The bot name "${botName}" is already taken. Please choose another.`
      });
    }
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    const sessionId = generateSessionId(botName);
    console.log(`📡 Pairing for ${botName} (${cleanPhone}) → ${sessionId}`);
    await startSession(sessionId, botName, cleanPhone, 'pair');
    return res.json({ success: true, sessionId, method: 'code', expiryIn: 120 });
  } catch (err) {
    console.error("Connect API Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// API 1b: Request QR Code (iPhone-friendly path)
app.post('/api/qr-connect', async (req, res) => {
  try {
    const disk = getDiskStatus();
    if (pairingPaused || disk.usePercent >= DISK_ALERT_AT) {
      return res.status(503).json({
        success: false,
        error: "🚧 New bot connections are paused for a few minutes — please try again shortly."
      });
    }
    const { botName } = req.body;
    if (!botName) {
      return res.status(400).json({ success: false, error: "Bot name is required!" });
    }
    if (await isBotNameTaken(botName)) {
      return res.status(409).json({
        success: false,
        error: `The bot name "${botName}" is already taken. Please choose another.`
      });
    }
    const sessionId = generateSessionId(botName);
    console.log(`📷 QR connect for ${botName} → ${sessionId}`);
    await startSession(sessionId, botName, null, 'qr');
    return res.json({ success: true, sessionId, method: 'qr', expiryIn: 120 });
  } catch (err) {
    console.error("QR Connect API Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// API 2: Poll Status (returns qr as well)
app.get('/api/status/:sessionId', (req, res) => {
  const session = activeSessions[req.params.sessionId];
  if (!session) return res.json({ status: 'expired' });
  if (session.status === 'connected') return res.json({ status: 'connected', sessionId: req.params.sessionId });
  if (session.error) return res.json({ status: 'error', error: session.error });
  if (Date.now() > session.expiry && !session.pairingCode && !session.qr) {
    delete activeSessions[req.params.sessionId];
    return res.json({ status: 'expired' });
  }
  return res.json({
    status: 'pairing',
    method: session.mode || 'code',
    pairingCode: session.pairingCode,
    qr: session.qr,
    secondsLeft: Math.max(0, Math.floor((session.expiry - Date.now()) / 1000))
  });
});

// API 3: Setup
app.post('/api/setup', async (req, res) => {
  try {
    const {
      sessionId, botName, ownerNumber, prefix, mode, alwaysOnline, welcome,
      autostatusview, autostatusreact, auttyping, autorecord, defaultStatusEmoji,
      antidelete
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
      antidelete: normalizeAntidelete(antidelete), // 'off' | 'chat' | 'dm'
      // Kept for backward compat; auto-react now uses a random neutral emoji.
      defaultStatusEmoji: defaultStatusEmoji || "✨"
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
// 🔐 ADMIN API — owner-only
// ──────────────────────────────────────────────────────────────
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

app.post('/api/admin/pause', requireAdmin, (req, res) => {
  pairingPaused = req.body?.paused === true || req.body?.paused === 'true';
  console.log(`🚦 Pairing ${pairingPaused ? 'PAUSED (emergency mode)' : 'RESUMED'}`);
  res.json({ success: true, pairingPaused });
});

app.get('/api/admin/usage', requireAdmin, async (req, res) => {
  try {
    const bots = await getTopUsageBots(Number(req.query.limit) || 20);
    return res.json({ success: true, bots });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/bots', requireAdmin, async (req, res) => {
  try {
    const { search, filterBy } = req.query; // filterBy can be 'name', 'number', or 'session'
    const { getAllBots } = require('./lib/database');
    
    let bots = await getAllBots();
    
    // Total count of all unique bots in the DB
    const totalBots = bots.length;

    if (search) {
      const q = search.toLowerCase();
      bots = bots.filter(b => {
        const name = (b.bot_name || "").toLowerCase();
        const num = (b.phone_number || "").toLowerCase();
        const sid = (b.session_id || "").toLowerCase();

        if (filterBy === 'number') return num.includes(q);
        if (filterBy === 'session') return sid.includes(q);
        return name.includes(q); // default search by bot name
      });
    }

    return res.json({ 
      success: true, 
      totalCount: totalBots, 
      filteredCount: bots.length, 
      bots 
    });
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
    return res.json({ success: true, message: `Bot ${sessionId} deleted.` });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// SPA Catch-all routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/Frontend/dist/index.html'));
});

server.listen(PORT, () => {
  console.log(`🌐 Empire MD Web Onboarding Portal running on port ${PORT}`);
  resumeSavedSessions();
});

module.exports = { app, server };
