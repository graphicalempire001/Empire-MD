// Empire MD - Core Message Handler (Per-Bot Owner, Final + fromMe fix + Abuse Gate + Antilink)
const config = require('../config');
const { getSettings, isBotAbusive, db } = require('./database');
const commands = require('./commands');

// Strict, per-bot owner checker.
// A sender is owner ONLY if they are the bot's own connected number,
// or an EXACT match to one of THIS bot's registered owner numbers.
// No global config.ownerNumber is consulted — each bot owns itself.
function isOwnerCheck(sender, botId, customOwners = []) {
    const cleanSender = sender.replace(/[^0-9]/g, '');
    const cleanBot = botId.replace(/[^0-9]/g, '');

    // The connected line is always its own owner
    if (cleanSender && cleanSender === cleanBot) return true;

    const owners = Array.isArray(customOwners) ? customOwners : [];

    return owners.some(owner => {
        const cleanOwner = String(owner).replace(/[^0-9]/g, '');
        if (!cleanOwner) return false;
        return cleanSender === cleanOwner; // exact match only — no substring/last-N leaks
    });
}

// Detects WhatsApp invite links, telegram, wa.me, shorteners, and generic URLs.
const LINK_REGEX = /(chat\.whatsapp\.com\/[A-Za-z0-9]+|wa\.me\/|t\.me\/|https?:\/\/|www\.[^\s]+|[a-z0-9-]+\.(com|net|org|io|xyz|me|link|gg|info|biz)\b)/i;

// Returns true if the given JID is a group admin (or super-admin).
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

// Unwrap ephemeral messages
if (msgType === "ephemeralMessage") {
    msg = msg.message;
}

// Unwrap view-once messages
while (
    msg?.ephemeralMessage ||
    msg?.viewOnceMessage ||
    msg?.viewOnceMessageV2 ||
    msg?.viewOnceMessageV2Extension
) {
    msg =
        msg.ephemeralMessage?.message ||
        msg.viewOnceMessage?.message ||
        msg.viewOnceMessageV2?.message ||
        msg.viewOnceMessageV2Extension?.message;
}

// Extract contextInfo
const contextInfo = msg?.contextInfo || {};

// Build universal quoted object
mek.quoted = null;

if (contextInfo.quotedMessage) {
    let quoted = contextInfo.quotedMessage;

    if (quoted.ephemeralMessage) {
        quoted = quoted.ephemeralMessage.message;
    }

    if (quoted.viewOnceMessageV2) {
        quoted = quoted.viewOnceMessageV2.message;
    }

    mek.quoted = {
        id: contextInfo.stanzaId,
        sender: contextInfo.participant,
        message: quoted,
        type: Object.keys(quoted)[0]
    };
}

        const chatJid = mek.key.remoteJid;
        const isGroup = chatJid.endsWith('@g.us');
        const connectedNumber = sock.user.id.split(':')[0];
        const botId = connectedNumber + '@s.whatsapp.net';

        // 🔑 Messages from the bot's OWN linked account are the owner by definition.
        const fromMe = mek.key.fromMe === true;

        // 🔑 Derive sender correctly:
        // - fromMe  → the message was sent by the owner's own account, so the real
        //             sender is the bot/owner number (NOT remoteJid, which is the recipient).
        // - group   → mek.key.participant is the actual sender.
        // - dm      → remoteJid is the other party.
        const sender = fromMe
            ? botId
            : (mek.key.participant || mek.key.remoteJid);

        const senderName = mek.pushName || "User";

        // Extract body
        const message = msg;

let body = "";

if (message.conversation)
    body = message.conversation;
else if (message.extendedTextMessage?.text)
    body = message.extendedTextMessage.text;
else if (message.imageMessage?.caption)
    body = message.imageMessage.caption;
else if (message.videoMessage?.caption)
    body = message.videoMessage.caption;
else if (message.documentMessage?.caption)
    body = message.documentMessage.caption;
if (!body || body.trim() === "") return;
        // 🚫 ABUSE GATE — a bot the admin flagged as abusive stops serving commands.
        // Prefer the live socket flag (free); fall back to a DB read.
        try {
            let abusive = sock.isAbusive === true;
            if (!abusive && sock.sessionId) {
                abusive = await isBotAbusive(sock.sessionId);
                sock.isAbusive = abusive; // warm the cache for next time
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

        // === Per-bot owner resolution (priority order) ===
        // 1) owners saved in the DB at pairing/setup
        // 2) the live socket tag set in server.js
        // 3) final guarantee: the bot's own connected number
        let ownerNumbers = [];
        if (Array.isArray(settings.ownerNumber) && settings.ownerNumber.length) {
            ownerNumbers = settings.ownerNumber;
        } else if (Array.isArray(sock.ownerNumber) && sock.ownerNumber.length) {
            ownerNumbers = sock.ownerNumber;
        } else {
            ownerNumbers = [connectedNumber];
        }

        // 🔑 fromMe is always owner; otherwise check this bot's owner list.
        const isOwner = fromMe || isOwnerCheck(sender, botId, ownerNumbers);

        // === DEBUG (remove later) ===
        const cleanSender = sender.replace(/[^0-9]/g, '');
        console.log(`[OWNER DEBUG] Session:${sock.sessionId || 'N/A'} | Sender:${cleanSender} | Bot:${connectedNumber} | Owners:${JSON.stringify(ownerNumbers)} | fromMe:${fromMe} | IsOwner:${isOwner} | Mode:${currentMode}`);

        // Parse command
        const isCmd = body.startsWith(prefix);
        const args = body.slice(prefix.length).trim().split(/ +/);
        const command = isCmd ? args.shift().toLowerCase() : "";
        const text = args.join(" ");

        // Non-command messages
        if (!isCmd) {

            // === 🔗 ANTILINK ENFORCEMENT (groups only) ===
            // Modes: off | warn | delete | kick  (set via .antilink in group.js)
            const antilinkMode = settings.antilink || "off";
            if (isGroup && antilinkMode !== "off" && !isOwner && !fromMe && LINK_REGEX.test(body)) {
                // Group admins are exempt (so admins can still share links).
                const senderIsAdmin = await isGroupAdmin(sock, chatJid, sender);
                if (!senderIsAdmin) {
                    // 1) Delete the offending message (requires the bot to be a group admin)
                    if (antilinkMode === "delete" || antilinkMode === "kick") {
                        try {
                            await sock.sendMessage(chatJid, { delete: mek.key });
                        } catch (e) {
                            console.error("Antilink delete failed (is the bot an admin?):", e.message);
                        }
                    }

                    // 2) Warn the sender
                    try {
                        await sock.sendMessage(chatJid, {
                            text: `🚫 *Antilink:* @${sender.split('@')[0]}, links are not allowed in this group.` +
                                  (antilinkMode === "kick" ? " You are being removed." : ""),
                            mentions: [sender]
                        });
                    } catch (_) {}

                    // 3) Kick the sender (requires the bot to be a group admin)
                    if (antilinkMode === "kick") {
                        try {
                            await sock.groupParticipantsUpdate(chatJid, [sender], "remove");
                        } catch (e) {
                            console.error("Antilink kick failed (is the bot an admin?):", e.message);
                        }
                    }

                    return; // stop processing this message entirely
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

        // Private mode protection — only THIS bot's owner may run commands
        if (currentMode === "private" && !isOwner) {
            console.log(`[PRIVATE BLOCK] Command blocked from ${cleanSender}`);
            return;
        }

        // Run command
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
                settings
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
