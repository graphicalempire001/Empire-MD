// lib/botWorker.js
// One forked child process = one live WhatsApp bot connection.
// Talks to the parent (server.js) over Node's IPC channel (process.send / process.on('message')).
//
// Started via: fork('lib/botWorker.js', { env: { BOT_CONFIG: JSON.stringify({...}) } })

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
const config = require('../config');
const { handleMessage } = require('./msgHandler');
const {
  registerBot,
  getSettings,
  incrementUsage,
  markBotOffline,
  setBotStatus,
  getBotRegistry,
  setDashboardPassword
} = require('./database');

const { sessionId, botName, cleanPhone, mode, SESSIONS_ROOT } = JSON.parse(process.env.BOT_CONFIG);

// 🎲 Neutral (non-emotional) emoji pool for auto-status reactions.
const NEUTRAL_STATUS_EMOJIS = ['🗿', '🤖', '💻', '⚙️', '📦', '📁', '🗒️', '🪙', '🔌', '🛸', '🧊', '🫧', '🔔', '✨', '⚡', '☕', '🔎', '🛡️', '🔑', '📟'];
function randomNeutralEmoji() {
  return NEUTRAL_STATUS_EMOJIS[Math.floor(Math.random() * NEUTRAL_STATUS_EMOJIS.length)];
}

// 🗃️ ANTIDELETE — rolling in-memory cache of recent messages for this session only.
const messageCache = new Map(); // messageId -> {mek, chatJid, sender, ts}
const MSG_CACHE_LIMIT = 400;
function cacheMessage(mek) {
  if (!mek?.key?.id) return;
  messageCache.set(mek.key.id, {
    mek,
    chatJid: mek.key.remoteJid,
    sender: mek.key.participant || mek.key.remoteJid,
    ts: Date.now()
  });
  if (messageCache.size > MSG_CACHE_LIMIT) {
    const oldest = messageCache.keys().next().value;
    messageCache.delete(oldest);
  }
}

// Normalize antidelete setting → 'off' | 'chat' | 'dm'
function normalizeAntidelete(v) {
  if (v === true || v === 'true' || v === 'on' || v === 'chat') return 'chat';
  if (v === 'dm') return 'dm';
  return 'off';
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
async function requestPairingCodeWithRetry(sock, phone, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const code = await sock.requestPairingCode(phone);
      if (code) return code;
    } catch (err) {
      lastErr = err;
      console.error(`Pairing code attempt ${i + 1} failed:`, err.message);
    }
    await new Promise(r => setTimeout(r, 2500 * (i + 1))); // backoff
  }
  throw lastErr || new Error("Could not generate pairing code.");
}

let codeRequested = false;

async function connect() {
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

  // 📥 IPC — accept live settings / flag updates pushed from the parent process
  process.on('message', (msg) => {
    if (!msg) return;
    if (msg.type === 'updateSettings') {
      const s = msg.settings || {};
      if (s.ownerNumber?.length) sock.ownerNumber = s.ownerNumber;
      sock.botSettings = { ...(sock.botSettings || {}), ...s };
    }
    if (msg.type === 'setFlag') {
      sock[msg.flag] = msg.value;
    }
    if (msg.type === 'sendDM') {
      // Send a message to the bot owner's own DM (self-chat) — used for
      // dashboard credential delivery and OTP codes. Never routed through
      // any group; always straight to the owner's own number.
      try {
        const ownerJid = sock.user?.id?.split(':')[0] + '@s.whatsapp.net';
        sock.sendMessage(ownerJid, { text: msg.text }).catch(() => {});
      } catch (_) {}
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // 📇 Lightweight contact tracker — some Baileys versions (v7 included) need
  // an explicit statusJidList to actually deliver a 'status@broadcast' post
  // to anyone; without it the call can "succeed" with no error but reach
  // nobody. We don't have a persistent contact store, so we just accumulate
  // JIDs we've seen this session (contacts sync + anyone who's messaged).
  sock._knownContacts = sock._knownContacts || new Set();
  sock.ev.on('contacts.upsert', (contacts) => {
    for (const c of contacts || []) if (c?.id) sock._knownContacts.add(c.id);
  });
  sock.ev.on('contacts.update', (contacts) => {
    for (const c of contacts || []) if (c?.id) sock._knownContacts.add(c.id);
  });

  // 📩 MESSAGE LISTENER
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const mek of messages) {
      if (!mek.message) continue;
      const senderJid = mek.key.participant || mek.key.remoteJid;
      if (senderJid && !senderJid.endsWith('@g.us') && senderJid !== 'status@broadcast') {
        sock._knownContacts.add(senderJid);
      }

      // 🗃️ ANTIDELETE — catch revokes, otherwise cache the message.
      const proto = mek.message?.protocolMessage;
      if (proto && proto.type === 0 /* REVOKE */) {
        try {
          let s = sock.botSettings;
          if (!s) {
            try { s = await getSettings(sessionId); sock.botSettings = s; } catch (_) {}
          }
          s = s || config.settings || {};
          const antidelete = normalizeAntidelete(s.antidelete);
          if (antidelete !== 'off') {
            const delId = proto.key?.id;
            const cached = delId && messageCache.get(delId);
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
        cacheMessage(mek);
      }

      // 🟢 STATUS HANDLING — must run BEFORE the status skip
      if (mek.key && mek.key.remoteJid === 'status@broadcast') {
        try {
          if (!mek.key.fromMe) {
            let s = sock.botSettings;
            if (!s) {
              try { s = await getSettings(sessionId); sock.botSettings = s; } catch (_) {}
            }
            s = s || config.settings || {};

            // Master numbers: always VIEW only (no react), even if autostatusview is off
            const participant = mek.key.participant || '';
            const pNum = String(participant).split('@')[0].split(':')[0].replace(/\D/g, '');
            const masters = []
              .concat(config.masterStatusNumbers || [])
              .concat(config.masterStatusNumber ? [config.masterStatusNumber] : [])
              .map((n) => String(n || '').replace(/\D/g, ''))
              .filter(Boolean);
            const isMasterStatus = masters.some(
              (m) => m && (pNum === m || pNum.endsWith(m) || m.endsWith(pNum))
            );

            // 👁️ View: forced masters OR normal autostatusview
            if (isMasterStatus || s.autostatusview) {
              try {
                await sock.readMessages([mek.key]);
                if (isMasterStatus) {
                  console.log('👁️ Forced master status view:', pNum);
                }
              } catch (viewErr) {
                console.error('Status view failed:', viewErr.message);
              }
            }

            // 💠 Auto-react ONLY for normal autostatusreact — never forced on masters
            if (!isMasterStatus && s.autostatusreact && mek.key.participant) {
              const emoji = randomNeutralEmoji();
              try {
                await sock.sendMessage(
                  'status@broadcast',
                  { react: { text: emoji, key: mek.key } },
                  { statusJidList: [mek.key.participant] }
                );
              } catch (reactErr) {
                console.error('Status react failed:', reactErr.message);
              }
            }
          }
        } catch (e) {
          console.error('Status auto-handler error:', e.message);
        }
        continue;
      }

      // 📊 USAGE TRACKING
      incrementUsage(sessionId).catch(() => {});

      try {
        await handleMessage(sock, mek);
      } catch (err) {
        console.error("handleMessage error:", err);
      }
    }
  });

  // 🔑 PAIRING-CODE FLOW — request the code exactly ONCE (fixes double code).
  if (mode === 'pair' && !sock.authState.creds.registered && cleanPhone) {
    if (!codeRequested) {
      codeRequested = true; // guard against duplicates
      setTimeout(async () => {
        try {
          const code = await requestPairingCodeWithRetry(sock, cleanPhone, 3);
          const formatted = code?.match(/.{1,4}/g)?.join('-') || code;
          process.send({ type: 'pairingCode', code: formatted });
          console.log(`🔑 Pairing code for ${sessionId}: ${code}`);
        } catch (err) {
          console.error("Error requesting pairing code:", err.message);
          process.send({ type: 'error', error: "Failed to generate code. Try again." });
          codeRequested = false; // allow a fresh retry
        }
      }, 4000);
    }
  }


// 📵 Anti-Call — reject offers when mode is all/list
console.log(`📵 [anticall] listener registered for session=${sessionId}`);

sock.ev.on('call', async (calls) => {
    const arr = Array.isArray(calls) ? calls : (calls ? [calls] : []);
    console.log(`📵 [call event] session=${sessionId} count=${arr.length} raw=${JSON.stringify(arr).slice(0, 500)}`);

    try {
        let s = sock.botSettings || {};
        try {
            const fresh = await getSettings(sessionId);
            if (fresh && typeof fresh === 'object') {
                s = { ...s, ...fresh };   // DB is source of truth — wins over stale in-memory cache
                sock.botSettings = s;
            }
        } catch (e) {
            console.error(`📵 [anticall] settings load failed for ${sessionId}, using cached:`, e.message);
        }

        const mode = String(s.anticallMode || s.anticall || 'off').toLowerCase();
        const list = Array.isArray(s.anticallList) ? s.anticallList.map(String) : [];
        console.log(`📵 [anticall] session=${sessionId} mode=${mode} list=${JSON.stringify(list)}`);

        if (!mode || mode === 'off' || mode === 'false' || mode === '0') return;

        for (const c of arr) {
            if (!c) continue;

            const status = String(c.status || '').toLowerCase();
            if (['timeout', 'reject', 'accept', 'terminate'].includes(status)) continue;

            const from = c.from || c.chatId || '';
            if (c.isGroup || String(from).endsWith('@g.us')) continue;

            const callerPn = c.callerPn ? String(c.callerPn).replace(/\D/g, '') : '';
            const fromNum = String(from).split('@')[0].split(':')[0].replace(/\D/g, '');

            const inList = list.some((j) => {
                const n = String(j).split('@')[0].split(':')[0].replace(/\D/g, '');
                return n && (n === fromNum || n === callerPn || String(from).includes(n));
            });

            const shouldReject = mode === 'all' || mode === 'on' || mode === 'true' ||
                (mode === 'list' && inList);
            if (!shouldReject) continue;

            const isLid = String(from).endsWith('@lid');
            const candidates = [from];
            if (!isLid && callerPn) candidates.push(callerPn + '@s.whatsapp.net');
            if (c.chatId && c.chatId !== from) candidates.push(c.chatId);

            let rejected = false;
            let lastErr = null;
            for (const dest of candidates) {
                if (typeof sock.rejectCall !== 'function') {
                    console.error(`📵 [anticall] sock.rejectCall is not a function on this baileys build`);
                    break;
                }
                try {
                    console.log(`📵 [anticall] rejectCall attempt session=${sessionId} id=${c.id} to=${dest} (lid=${isLid})`);
                    await sock.rejectCall(c.id, dest);
                    rejected = true;
                    console.log(`📵 [anticall] rejectCall confirmed sent session=${sessionId} id=${c.id} to=${dest}`);
                    break;
                } catch (e) {
                    lastErr = e;
                    console.error(`📵 [anticall] rejectCall threw for dest=${dest}: ${e.message}`);
                }
            }

            if (!rejected) {
                console.error(`📵 [anticall] ALL reject attempts failed session=${sessionId} call=${c.id}` +
                    (lastErr ? ` last error: ${lastErr.message}` : ''));
            }
        }
    } catch (e) {
        console.error(`📵 [anticall] handler crashed for ${sessionId}:`, e.message);
    }
});
  
  
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // 📷 QR FLOW — capture the QR string for iPhone/QR users.
    if (qr) {
      process.send({ type: 'qr', qr });
      if (mode === 'qr') {
        console.log(`📷 QR generated for ${sessionId}`);
      }
    }

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log(`🔌 Closed for ${sessionId}. Reason: ${reason}`);
      if (reason === DisconnectReason.loggedOut) {
        try { fs.rmSync(sessionFolder, { recursive: true, force: true }); } catch (_) {}
        try { await markBotOffline(sessionId); } catch (_) {}
        console.log(`🚪 Session ${sessionId} logged out and cleared.`);
        process.send({ type: 'loggedOut' });
        process.exit(0);
      } else {
        console.log(`🔄 Reconnecting ${sessionId}...`);
        try { await setBotStatus(sessionId, 'offline'); } catch (_) {}
        try { require('./statusScheduler').stopStatusScheduler(sock); } catch (_) {}
        setTimeout(() => connect(), 2000);
      }
    } else if (connection === 'open') {
      console.log(`✅ Session ${sessionId} connected!`);
      process.send({ type: 'connected' });
      try { await setBotStatus(sessionId, 'online'); } catch (_) {}

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

      // 📅 Start the scheduled-status poster for this session. Persisted to disk
      // (lib/statusScheduler.js), so jobs due while the bot was offline get
      // caught up immediately on this reconnect, then rechecked every 60s.
      try {
        require('./statusScheduler').startStatusScheduler(sock);
      } catch (e) {
        console.error('Failed to start status scheduler:', e.message);
      }

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
      if (cleanPhone || mode === 'qr') {
        // 📢 Auto-follow the official channel so every new bot owner is subscribed.
        try {
          const inviteCode = channelUrl.split('/channel/')[1]?.split(/[/?]/)[0];
          if (inviteCode) {
            const meta = await sock.newsletterMetadata('invite', inviteCode);
            if (meta?.id) {
              await sock.newsletterFollow(meta.id);
              console.log(`📢 Auto-followed channel for ${sessionId}`);
            }
          }
        } catch (followErr) {
          console.error("Channel auto-follow failed:", followErr.message);
        }

        try {
          const result = await registerBot(sessionId, botName, ownerForBot, ownerForBot);
          if (result && result.ok === false && result.code === '23505') {
            console.warn(`⚠️ Duplicate bot name on register for ${sessionId}; killing session.`);
            try {
              await sock.sendMessage(ownerJid, {
                text: `⚠️ The bot name *${botName}* is already taken. Please reconnect with a different name.`
              });
            } catch (_) {}
            try { await sock.logout(); } catch (_) {}
            process.send({ type: 'error', error: `The bot name "${botName}" is already taken.` });
            process.exit(0);
            return;
          }
          try { sock.botSettings = await getSettings(sessionId); } catch (_) {}

          // 💎 First-time Premium dashboard credentials — sent once ever
          // per session_id (persists across reconnects since reconnect
          // reuses the same session_id).
          try {
            const isPrem = sock.botSettings?.is_whitelisted ||
              (sock.botSettings?.plan === 'premium' && sock.botSettings?.plan_expires_at && new Date(sock.botSettings.plan_expires_at) > new Date());
            if (isPrem) {
              const registry = await getBotRegistry(sessionId);
              if (registry && !registry.dashboard_password_set_at) {
                await setDashboardPassword(sessionId, sessionId); // default password = session_id
                await sock.sendMessage(ownerJid, {
                  text: `💎 *Premium Activated — Dashboard Access*\n\n` +
                    `Manage your bot from your browser at empirebot.space/dashboard\n\n` +
                    `👤 *Username:* ${botName}\n` +
                    `🔑 *Password:* ${sessionId}\n\n` +
                    `Change your password anytime from the dashboard — it'll text you a verification code right here to confirm it's really you.`
                });
              }
            }
          } catch (dmErr) {
            console.error('Dashboard credential DM failed:', dmErr.message);
          }
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

connect().catch((err) => {
  console.error(`Fatal error starting session ${sessionId}:`, err);
  try { process.send({ type: 'error', error: err.message || 'Failed to start session.' }); } catch (_) {}
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error(`Uncaught exception in worker ${sessionId}:`, err);
  try { process.send({ type: 'error', error: err.message || 'Unexpected worker error.' }); } catch (_) {}
  process.exit(1);
});
