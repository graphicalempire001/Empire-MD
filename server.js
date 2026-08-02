const express = require('express'); // 🟢 Move imports to the top
const compression = require('compression');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { execSync, fork } = require('child_process');
const config = require('./config');
const {
  getPublicBots,
  updateSettings,
  isBotNameTaken,
  getTopUsageBots,
  getInactiveBots,
  flagAbusive,
  deleteBot
} = require('./lib/database');

const app = express(); // 🟢 Only declare this ONCE
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(compression()); // 🟢 Gzip compression for mobile speed
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the compiled React Frontend app
app.use(express.static(path.join(__dirname, 'public/Frontend/dist')));

const activeSessions = {}; // { [sessionId]: { process, botName, phoneNumber, mode, status, pairingCode, qr, error, codeRequested, expiry } }
const SESSIONS_ROOT = path.join(__dirname, 'sessions');

// 🚦 EMERGENCY SWITCH
let pairingPaused = false;

// Reserve threshold: warn/act when the volume is this % full (keep 10% free).
const RESERVE_PERCENT = 10;
const DISK_ALERT_AT = 100 - RESERVE_PERCENT; // 90

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

// 🧹 Fully terminate a live session (kill the child process) before removing it.
async function killSession(sessionId) {
  const s = activeSessions[sessionId];
  if (s?.process) {
    try { s.process.kill('SIGTERM'); } catch (_) {}
  }
  delete activeSessions[sessionId];
  try { fs.rmSync(path.join(SESSIONS_ROOT, sessionId), { recursive: true, force: true }); } catch (_) {}
}

// 🚀 Spawn the actual WhatsApp connection in its own child process (lib/botWorker.js).
// Keeps a crash/leak in one bot's Baileys socket from ever taking down the whole server.
// _crashInfo carries the respawn counters forward across an unexpected-exit auto-respawn.
function spawnBotProcess(sessionId, botName, cleanPhone, mode, _crashInfo = {}) {
  const child = fork(path.join(__dirname, 'lib/botWorker.js'), [], {
    env: {
      ...process.env,
      BOT_CONFIG: JSON.stringify({ sessionId, botName, cleanPhone, mode, SESSIONS_ROOT })
    },
    silent: false
  });

  activeSessions[sessionId] = {
    process: child, botName, phoneNumber: cleanPhone, mode,
    status: 'pairing', pairingCode: null, qr: null,
    error: null, codeRequested: true, expiry: Date.now() + 120000,
    crashCount: _crashInfo.crashCount || 0,
    lastCrashAt: _crashInfo.lastCrashAt || null
  };

  child.on('message', (msg) => {
    const s = activeSessions[sessionId];
    if (!s) return;
    if (msg.type === 'pairingCode') s.pairingCode = msg.code;
    if (msg.type === 'qr') s.qr = msg.qr;
    if (msg.type === 'connected') { s.status = 'connected'; s.qr = null; }
    if (msg.type === 'loggedOut') delete activeSessions[sessionId];
    if (msg.type === 'error') s.error = msg.error;
  });

  child.on('exit', (code, signal) => {
    console.log(`⚠️ Bot process ${sessionId} exited (code ${code}, signal ${signal})`);
    const s = activeSessions[sessionId];
    // Already cleaned up — either killSession() deleted it (manual stop/admin delete)
    // or the worker sent 'loggedOut' before exiting. Either way: no respawn.
    if (!s) return;

    // 🔁 Unexpected exit (crash) — auto-respawn with backoff, capped so a bot that
    // crashes on startup every time doesn't loop forever and hammer the server.
    const MAX_CRASH_RESPAWNS = 5;
    const CRASH_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
    const now = Date.now();
    const withinWindow = s.lastCrashAt && (now - s.lastCrashAt) < CRASH_WINDOW_MS;
    const crashCount = withinWindow ? s.crashCount + 1 : 1;

    if (crashCount > MAX_CRASH_RESPAWNS) {
      console.error(`🛑 ${sessionId} crashed ${crashCount} times within ${CRASH_WINDOW_MS / 60000}min — giving up auto-respawn. Re-pair manually.`);
      delete activeSessions[sessionId];
      return;
    }

    const delay = Math.min(5000 * crashCount, 60000); // 5s, 10s, 15s... capped at 60s
    console.log(`🔁 Auto-respawning ${sessionId} in ${delay / 1000}s (crash ${crashCount}/${MAX_CRASH_RESPAWNS})...`);
    setTimeout(() => {
      spawnBotProcess(sessionId, botName, cleanPhone, mode, { crashCount, lastCrashAt: now });
    }, delay);
  });

  return child;
}

// Keep legacy async wrapper so all existing callers (resumeSavedSessions etc.) work unchanged
async function startSession(sessionId, botName, cleanPhone, mode = 'pair') {
  spawnBotProcess(sessionId, botName, cleanPhone, mode);
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

    const liveProcess = activeSessions[sessionId]?.process;
    if (liveProcess) {
      liveProcess.send({ type: 'updateSettings', settings: updatedSettings });
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
    const liveProcess = activeSessions[req.params.sessionId]?.process;
    if (liveProcess) liveProcess.send({ type: 'setFlag', flag: 'isAbusive', value });
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
