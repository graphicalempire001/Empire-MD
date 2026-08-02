const { parentPort } = require('worker_threads');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const config = require('./config');
const { handleMessage } = require('./lib/msgHandler');
const { getSettings, incrementUsage, markBotOffline } = require('./lib/database');

// Retrieve initialization data from process environment or worker data
const sessionId = process.env.SESSION_ID;
const botName = process.env.BOT_NAME;
const cleanPhone = process.env.CLEAN_PHONE;
const mode = process.env.CONNECTION_MODE || 'pair';

if (!sessionId) {
    console.error("❌ Session ID is required to start bot-runner.js");
    process.exit(1);
}

const SESSIONS_ROOT = path.join(__dirname, 'sessions');
const messageCache = new Map();
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

// Notify master process about status changes
function sendToMaster(type, data) {
    if (process.send) {
        process.send({ type, data });
    } else {
        console.log(`[Worker Message - ${type}]:`, data);
    }
}

async function startIsolatedSession() {
    const sessionFolder = path.join(SESSIONS_ROOT, sessionId);
    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
    const { version } = await fetchLatestBaileysVersion();

    console.log(`🤖 Starting isolated session: ${sessionId} for bot: ${botName}`);

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: Browsers.ubuntu('Chrome'),
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 15000,
        retryRequestDelayMs: 2000,
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

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const mek of messages) {
            if (!mek.message) continue;

            const proto = mek.message?.protocolMessage;
            if (proto && proto.type === 0 /* REVOKE */) {
                try {
                    let s = sock.botSettings || config.settings || {};
                    if (s.antidelete && s.antidelete !== 'off') {
                        const delId = proto.key?.id;
                        const cached = delId && messageCache.get(delId);
                        if (cached && !cached.mek.key.fromMe) {
                            const ownerJid = (sock.ownerNumber?.[0] || sock.user.id.split(':')[0]) + '@s.whatsapp.net';
                            const destination = s.antidelete === 'dm' ? ownerJid : cached.chatJid;
                            const who = cached.sender.split('@')[0];
                            const header = `🗑️ *Antidelete - recovered message*
👤 *From:* @${who}
💬 *Chat:* ${cached.chatJid.endsWith('@g.us') ? 'Group' : 'Private'}`;
                            
                            await sock.sendMessage(destination, { text: header, mentions: [cached.sender] });
                            await sock.sendMessage(destination, { forward: cached.mek });
                        }
                    }
                } catch (e) {
                    console.error("Antidelete error:", e.message);
                }
                continue;
            } else {
                cacheMessage(mek);
            }

            if (mek.key && mek.key.remoteJid === 'status@broadcast') {
                try {
                    let s = sock.botSettings || config.settings || {};
                    if (s.autostatusview) await sock.readMessages([mek.key]);
                } catch (e) {
                    console.error("Status handler error:", e.message);
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
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            sendToMaster('qr', { qr, sessionId });
        }

        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            console.log(`🔌 Process connection closed for ${sessionId}. Reason: ${reason}`);
            sendToMaster('status', { status: 'disconnected', reason });

            if (reason === DisconnectReason.loggedOut) {
                try { fs.rmSync(sessionFolder, { recursive: true, force: true }); } catch (_) {}
                try { await markBotOffline(sessionId); } catch (_) {}
                process.exit(0);
            } else {
                setTimeout(startIsolatedSession, 5000);
            }
        } else if (connection === 'open') {
            console.log(`✅ Connection open for ${sessionId}`);
            sendToMaster('status', { status: 'connected', sessionId });

            const connectedNumber = sock.user.id.split(':')[0];
            if (!sock.ownerNumber || !sock.ownerNumber.length) {
                sock.ownerNumber = [connectedNumber];
            }
            try {
                const s = sock.botSettings || config.settings || {};
                if (s.alwaysOnline) await sock.sendPresenceUpdate('available');
            } catch (_) {}
        }
    });
}

// Receive messages from the master server (e.g. settings updates, global stops)
process.on('message', async (message) => {
    if (message.type === 'updateSettings') {
        console.log(`⚙️ Worker received settings update for ${sessionId}`);
        // Refresh local worker cache
        try {
            const freshSettings = await getSettings(sessionId);
            sendToMaster('settingsUpdated', freshSettings);
        } catch (_) {}
    } else if (message.type === 'shutdown') {
        console.log(`🚪 Shutting down isolated worker process: ${sessionId}`);
        process.exit(0);
    }
});

startIsolatedSession().catch((err) => {
    console.error("Fatal worker startup error:", err);
    process.exit(1);
});
