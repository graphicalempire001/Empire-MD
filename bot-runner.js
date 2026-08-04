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


const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

async function downloadMediaBuffer(node, mediaType) {
    const stream = await downloadContentFromMessage(node, mediaType);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    return buffer;
}

/** Unwrap view-once / ephemeral wrappers and re-send media so deleted view-once + voice notes are recovered. */
async function recoverDeletedContent(sock, destination, originalMek, senderJid) {
    try {
        let msg = originalMek.message;
        if (!msg) return false;

        // Unwrap common wrappers
        while (
            msg.ephemeralMessage ||
            msg.viewOnceMessage ||
            msg.viewOnceMessageV2 ||
            msg.viewOnceMessageV2Extension
        ) {
            msg =
                msg.ephemeralMessage?.message ||
                msg.viewOnceMessage?.message ||
                msg.viewOnceMessageV2?.message ||
                msg.viewOnceMessageV2Extension?.message;
            if (!msg) return false;
        }

        const type = Object.keys(msg).find(k =>
            ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage', 'conversation', 'extendedTextMessage'].includes(k)
        );
        if (!type) return false;

        const node = msg[type];
        const captionTag = `_(recovered from @${(senderJid || '').split('@')[0]})_`;

        if (type === 'imageMessage') {
            const buf = await downloadMediaBuffer(node, 'image');
            await sock.sendMessage(destination, {
                image: buf,
                caption: (node.caption ? node.caption + '\n' : '') + captionTag,
                mentions: senderJid ? [senderJid] : []
            });
            return true;
        }
        if (type === 'videoMessage') {
            const buf = await downloadMediaBuffer(node, 'video');
            await sock.sendMessage(destination, {
                video: buf,
                caption: (node.caption ? node.caption + '\n' : '') + captionTag,
                mentions: senderJid ? [senderJid] : []
            });
            return true;
        }
        if (type === 'audioMessage') {
            const buf = await downloadMediaBuffer(node, 'audio');
            await sock.sendMessage(destination, {
                audio: buf,
                mimetype: node.mimetype || 'audio/ogg; codecs=opus',
                ptt: !!node.ptt
            });
            return true;
        }
        if (type === 'stickerMessage') {
            const buf = await downloadMediaBuffer(node, 'sticker');
            await sock.sendMessage(destination, { sticker: buf });
            return true;
        }
        if (type === 'documentMessage') {
            const buf = await downloadMediaBuffer(node, 'document');
            await sock.sendMessage(destination, {
                document: buf,
                mimetype: node.mimetype,
                fileName: node.fileName || 'recovered'
            });
            return true;
        }
        if (type === 'conversation' || type === 'extendedTextMessage') {
            const body = type === 'conversation' ? msg.conversation : (node.text || '');
            if (body) {
                await sock.sendMessage(destination, {
                    text: body + '\n' + captionTag,
                    mentions: senderJid ? [senderJid] : []
                });
                return true;
            }
        }
        return false;
    } catch (e) {
        console.error("recoverDeletedContent failed:", e.message);
        return false;
    }
}


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
        markOnlineOnConnect: false,
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

                            // Prefer re-sending unwrapped content so view-once + voice notes are fully recovered
                            const recovered = await recoverDeletedContent(sock, destination, cached.mek, cached.sender);
                            if (!recovered) {
                                // Fallback: plain forward
                                await sock.sendMessage(destination, { forward: cached.mek });
                            }
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



    // 🚫 Anti status-mention event (when supported by Baileys build)
    try {
        sock.ev.on('status.mention', async (payload) => {
            try {
                const msg = payload?.message || payload;
                const key = msg?.key;
                if (!key?.remoteJid || !key.remoteJid.endsWith('@g.us')) return;
                const s = sock.botSettings || config.settings || {};
                const gMods = (s.groupMods && s.groupMods[key.remoteJid]) || {};
                if (!gMods.antimention) return;
                if (key.fromMe) return;
                await sock.sendMessage(key.remoteJid, { delete: key });
            } catch (e) {
                console.error('status.mention delete failed:', e.message);
            }
        });
    } catch (_) {}

    // 👋 Per-group greet on join
    sock.ev.on('group-participants.update', async (update) => {
        try {
            if (!update || update.action !== 'add') return;
            const chatJid = update.id;
            const s = sock.botSettings || config.settings || {};
            const gMods = (s.groupMods && s.groupMods[chatJid]) || {};
            if (!gMods.greet) return;
            const template = gMods.greetText || '👋 Welcome @user to the group!';
            for (const jid of (update.participants || [])) {
                const mention = '@' + String(jid).split('@')[0];
                const text = template.replace(/@user/gi, mention);
                await sock.sendMessage(chatJid, { text, mentions: [jid] });
            }
        } catch (e) {
            console.error('Group greet error:', e.message);
        }
    });


// 📵 Anti-Call — reject offers when mode is all/list
console.log('📵 [anticall] listener registered for session=' + sessionId);

sock.ev.on('call', async (calls) => {
    const arr = Array.isArray(calls) ? calls : (calls ? [calls] : []);
    console.log('📵 [call event] session=' + sessionId + ' count=' + arr.length +
        ' raw=' + JSON.stringify(arr).slice(0, 500));

    try {
       
        let s = sock.botSettings || {};
        try {
            const { getSettings } = require('./lib/database');
            const fresh = await getSettings(sock.sessionId);
            if (fresh && typeof fresh === 'object') {
                s = { ...s, ...fresh };       // fresh DB values win, not memory
                sock.botSettings = s;
            }
        } catch (e) {
            console.error('📵 [anticall] settings load failed, using cached:', e.message);
        }

        const mode = String(s.anticallMode || s.anticall || 'off').toLowerCase();
        const list = Array.isArray(s.anticallList) ? s.anticallList.map(String) : [];
        console.log('📵 [anticall] mode=' + mode + ' list=' + JSON.stringify(list));

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
                    console.error('📵 [anticall] sock.rejectCall is not a function on this baileys build');
                    break;
                }
                try {
                    console.log('📵 [anticall] rejectCall attempt id=' + c.id + ' to=' + dest +
                        ' (lid=' + isLid + ')');
                    await sock.rejectCall(c.id, dest);
                    rejected = true;
                    console.log('📵 [anticall] rejectCall confirmed sent id=' + c.id + ' to=' + dest);
                    break; // stop after first non-throwing attempt — don't double-send
                } catch (e) {
                    lastErr = e;
                    console.error('📵 [anticall] rejectCall threw for dest=' + dest + ': ' + e.message);
                }
            }

            if (!rejected) {
                console.error('📵 [anticall] ALL reject attempts failed for call ' + c.id +
                    (lastErr ? (' last error: ' + lastErr.message) : ''));
            }
        }
    } catch (e) {
        console.error('📵 [anticall] handler crashed:', e.message);
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
                if (s.hidePresence) {
                    await sock.sendPresenceUpdate('unavailable');
                } else if (s.alwaysOnline) {
                    await sock.sendPresenceUpdate('available');
                }
            } catch (_) {}

            // 📢 Auto-follow the official channel on connect
            try {
                const jid = config.newsletterJid;
                if (jid && sock.newsletterFollow) {
                    await sock.newsletterFollow(jid);
                    console.log('✅ Auto-followed channel', jid);
                }
            } catch (e) {
                console.error('Channel auto-follow failed:', e.message);
            }
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
                            
