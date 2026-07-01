// Empire MD - Core Message Handler (Per-Bot Owner, Final + fromMe fix + Abuse Gate + Antilink + Greet + Away)
const config = require('../config');
const { getSettings, isBotAbusive, db } = require('./database');
const commands = require('./commands');

// Strict, per-bot owner checker.
function isOwnerCheck(sender, botId, customOwners = []) {
    const cleanSender = sender.replace(/[^0-9]/g, '');
    const cleanBot = botId.replace(/[^0-9]/g, '');

    if (cleanSender && cleanSender === cleanBot) return true;

    const owners = Array.isArray(customOwners) ? customOwners : [];
    return owners.some(owner => {
        const cleanOwner = String(owner).replace(/[^0-9]/g, '');
        if (!cleanOwner) return false;
        return cleanSender === cleanOwner; // exact match only
    });
}

// Detects WhatsApp invite links, telegram, wa.me, shorteners, and generic URLs.
const LINK_REGEX = /(chat\.whatsapp\.com\/[A-Za-z0-9]+|wa\.me\/|t\.me\/|https?:\/\/|www\.[^\s]+|[a-z0-9-]+\.(com|net|org|io|xyz|me|link|gg|info|biz)\b)/i;

// ─── Auto-greeting & away trackers (per runtime, per session) ───
const greetedContacts = new Set();        // key: `${sessionId}:${jid}` — greet a new contact once
const awayCooldown = {};                  // key: `${sessionId}:${jid}` → last away-reply timestamp
const AWAY_COOLDOWN_MS = 10 * 60 * 1000;  // don't re-send the away message within 10 minutes

async function isGroupAdmin(sock, chatJid, jid) {
    try {
        const meta = await sock.groupMetadata(chatJid);
        const p = meta.participants.find(x => x.id === jid);
        return !!(p && (p.admin === 'admin' || p.admin === 'superadmin'));
    } catch (_) {
        return false;
    }
}

async function handleAgentReply(sock, mek, body, chatJid, sender, settings) {
    const autoreply = settings.autoreply ?? config.settings?.autoreply;
    if (autoreply && !chatJid.endsWith('@g.us')) {
        await sock.sendMessage(chatJid, {
            text: "🤖 *[Empire MD Auto-Response]* Thank you for reaching out! The owner is currently away. Please use .help to see available commands."
        }, { quoted: mek });
    }
}

async function handleMessage(sock, mek) {
    try {
        if (!mek.message) return;

        // Get actual message type
        const msgType = Object.keys(mek.message)[0];
        let msg = mek.message[msgType];

        // Unwrap ephemeral wrapper
        if (msgType === "ephemeralMessage") {
            msg = msg.message;
            // after unwrap, msg is the inner container { <type>: {...} }
            const innerType = Object.keys(msg)[0];
            msg = msg[innerType];
        }

        // Unwrap view-once / nested wrappers
        while (
            msg?.ephemeralMessage ||
            msg?.viewOnceMessage ||
            msg?.viewOnceMessageV2 ||
            msg?.viewOnceMessageV2Extension
        ) {
            const unwrapped =
                msg.ephemeralMessage?.message ||
                msg.viewOnceMessage?.message ||
                msg.viewOnceMessageV2?.message ||
                msg.viewOnceMessageV2Extension?.message;
            if (!unwrapped) break;
            const t = Object.keys(unwrapped)[0];
            msg = unwrapped[t];
        }

        // Extract contextInfo (works whether msg is a node object or a string)
        const contextInfo = (msg && typeof msg === "object" && msg.contextInfo) || {};

        // Build universal quoted object
        mek.quoted = null;
        if (contextInfo.quotedMessage) {
            let quoted = contextInfo.quotedMessage;
            while (
                quoted?.ephemeralMessage ||
                quoted?.viewOnceMessage ||
                quoted?.viewOnceMessageV2 ||
                quoted?.viewOnceMessageV2Extension
            ) {
                quoted =
                    quoted.ephemeralMessage?.message ||
                    quoted.viewOnceMessage?.message ||
                    quoted.viewOnceMessageV2?.message ||
                    quoted.viewOnceMessageV2Extension?.message;
            }
            mek.quoted = {
                id: contextInfo.stanzaId,
                sender: contextInfo.participant,
                message: quoted,
                type: quoted ? Object.keys(quoted)[0] : null
            };
        }
        mek.quotedSender = mek.quoted?.sender || null;

        const chatJid = mek.key.remoteJid;
        const isGroup = chatJid.endsWith('@g.us');
        const connectedNumber = sock.user.id.split(':')[0];
        const botId = connectedNumber + '@s.whatsapp.net';

        const fromMe = mek.key.fromMe === true;
        const sender = fromMe
            ? botId
            : (mek.key.participant || mek.key.remoteJid);
        const senderName = mek.pushName || "User";

        // ✅ FIXED body extraction — msg is already the inner node/string
        let body =
            (typeof msg === "string" ? msg : "") ||   // conversation is a raw string
            msg?.conversation ||
            msg?.text ||                               // extendedTextMessage inner node
            msg?.caption ||                            // image/video/document inner node
            msg?.imageMessage?.caption ||              // safety fallbacks
            msg?.videoMessage?.caption ||
            msg?.extendedTextMessage?.text ||
            "";

        // 🚫 ABUSE GATE
        try {
            let abusive = sock.isAbusive === true;
            if (!abusive && sock.sessionId) {
                abusive = await isBotAbusive(sock.sessionId);
                sock.isAbusive = abusive;
            }
            if (abusive) {
                console.log(`[ABUSE BLOCK] Session ${sock.sessionId || 'N/A'} is flagged abusive — ignoring message.`);
                return;
            }
        } catch (_) {}

        // Load THIS bot's settings (per-session)
        let settings = {};
        try {
            if (sock.sessionId) {
                settings = (await getSettings(sock.sessionId)) || {};
            }
        } catch (e) {
            console.error("Settings load error:", e.message);
        }

        const currentMode = settings.mode || config.mode || "private";
        const prefix = settings.prefix || config.prefix || ".";

        // === Per-bot owner resolution ===
        let ownerNumbers = [];
        if (Array.isArray(settings.ownerNumber) && settings.ownerNumber.length) {
            ownerNumbers = settings.ownerNumber;
        } else if (Array.isArray(sock.ownerNumber) && sock.ownerNumber.length) {
            ownerNumbers = sock.ownerNumber;
        } else {
            ownerNumbers = [connectedNumber];
        }

        const isOwner = fromMe || isOwnerCheck(sender, botId, ownerNumbers);

        const cleanSender = sender.replace(/[^0-9]/g, '');
        console.log(`[OWNER DEBUG] Session:${sock.sessionId || 'N/A'} | Sender:${cleanSender} | Bot:${connectedNumber} | Owners:${JSON.stringify(ownerNumbers)} | fromMe:${fromMe} | IsOwner:${isOwner} | Mode:${currentMode} | Body:"${body}"`);

        // Parse command
        const isCmd = body.startsWith(prefix);
        const args = body.slice(prefix.length).trim().split(/ +/);
        const command = isCmd ? args.shift().toLowerCase() : "";
        const text = args.join(" ");

        // Non-command messages
        if (!isCmd) {
            // === 🔗 ANTILINK ENFORCEMENT (groups only) ===
            const antilinkMode = settings.antilink || "off";
            if (isGroup && antilinkMode !== "off" && !isOwner && !fromMe && LINK_REGEX.test(body)) {
                const senderIsAdmin = await isGroupAdmin(sock, chatJid, sender);
                if (!senderIsAdmin) {
                    if (antilinkMode === "delete" || antilinkMode === "kick") {
                        try { await sock.sendMessage(chatJid, { delete: mek.key }); }
                        catch (e) { console.error("Antilink delete failed (is the bot an admin?):", e.message); }
                    }
                    try {
                        await sock.sendMessage(chatJid, {
                            text: `🚫 *Antilink:* @${sender.split('@')[0]}, links are not allowed in this group.` +
                                  (antilinkMode === "kick" ? " You are being removed." : ""),
                            mentions: [sender]
                        });
                    } catch (_) {}
                    if (antilinkMode === "kick") {
                        try { await sock.groupParticipantsUpdate(chatJid, [sender], "remove"); }
                        catch (e) { console.error("Antilink kick failed (is the bot an admin?):", e.message); }
                    }
                    return;
                }
            }

            // === 🧾 BUSINESS AUTO-GREETING (first message from a NEW private contact) ===
            if (!isGroup && !fromMe && settings.autogreet) {
                const gKey = `${sock.sessionId || 'N/A'}:${sender}`;
                if (!greetedContacts.has(gKey)) {
                    greetedContacts.add(gKey);
                    const greetText = settings.greetMessage ||
                        `👋 *Hello and welcome!*\n\nThanks for reaching out to *${config.botName}*. ` +
                        `Your message has been received — we'll get back to you shortly.\n\n` +
                        `Meanwhile, type *${prefix}help* to see what I can do.`;
                    try { await sock.sendMessage(chatJid, { text: greetText }, { quoted: mek }); } catch (_) {}
                }
            }

            // === 🌙 AWAY MODE (DM, or when the owner is mentioned/replied-to in a group) ===
            if (!fromMe && settings.awaymode) {
                const mentions = contextInfo.mentionedJid || [];
                const ownerMatch = (jid) =>
                    ownerNumbers.some(o => {
                        const co = String(o).replace(/[^0-9]/g, '');
                        return co && jid.replace(/[^0-9]/g, '').endsWith(co);
                    });

                const mentionedOwner = mentions.some(ownerMatch);
                const repliedToOwner = mek.quotedSender ? ownerMatch(mek.quotedSender) : false;
                const trigger = !isGroup || mentionedOwner || repliedToOwner;

                const aKey = `${sock.sessionId || 'N/A'}:${sender}`;
                const last = awayCooldown[aKey] || 0;

                if (trigger && (Date.now() - last > AWAY_COOLDOWN_MS)) {
                    awayCooldown[aKey] = Date.now();
                    const awayText = settings.awayMessage ||
                        `🌙 *I'm currently away.*\n\nThe owner isn't available right now, but your message has been noted. ` +
                        `I'll respond as soon as I'm back.`;
                    try { await sock.sendMessage(chatJid, { text: awayText }, { quoted: mek }); } catch (_) {}
                }
            }

            if (db.afk) {
                const mentions = contextInfo.mentionedJid || [];
                for (const jid of mentions) {
                    if (db.afk[jid]) {
                        const afkData = db.afk[jid];
                        await sock.sendMessage(chatJid, {
                            text: `🔔 *[AFK MODE]* @${jid.split('@')[0]} is Away.
*Reason:* ${afkData.reason}
*Since:* ${new Date(afkData.time).toLocaleTimeString()}`,
                            mentions: [jid]
                        }, { quoted: mek });
                    }
                }
            }

            await handleAgentReply(sock, mek, body, chatJid, sender, settings);
            return;
        }

        // Private mode protection
        if (currentMode === "private" && !isOwner) {
            console.log(`[PRIVATE BLOCK] Command blocked from ${cleanSender}`);
            return;
        }

        console.log({ body, prefix, isCmd, command, args, text });

        // Run command — every command now receives quoted context
        if (commands[command]) {
            await commands[command]({
                sock,
                mek,
                chatJid,
                sender,
                senderName,
                isGroup,
                isOwner,
                args,
                text,
                body,
                prefix,
                settings,
                quoted: mek.quoted,
                quotedSender: mek.quotedSender,
                contextInfo
            });
        } else {
            console.log(`[WARN] Unknown command: ${command}`);
        }
    } catch (err) {
        console.error("Error in message handler:", err);
    }
}

module.exports = {
    handleMessage
};
