// Empire MD - Core Message Handler
const config = require('../config');
const { getSettings, db } = require('./database');
const commands = require('./commands');

// Helper to check if a number is owner (accepts dynamic owner list from DB settings)
function isOwnerCheck(sender, botId, customOwners = []) {
    const cleanSender = sender.replace(/[^0-9]/g, '');
    const cleanBot = botId.replace(/[^0-9]/g, '');

    // The bot's own number is always owner
    if (cleanSender === cleanBot) return true;

    // Merge DB owner numbers with config fallback, dedupe
    const owners = [
        ...(Array.isArray(customOwners) ? customOwners : []),
        ...((config.ownerNumber && Array.isArray(config.ownerNumber)) ? config.ownerNumber : [])
    ];

    return owners.some(owner => {
        const cleanOwner = String(owner).replace(/[^0-9]/g, '');
        // Exact match (avoids false positives from substring includes)
        return cleanOwner.length > 0 && cleanSender === cleanOwner;
    });
}

// Automatic smart replies/AI agent when not a command
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
        const chatJid = mek.key.remoteJid;
        const isGroup = chatJid.endsWith('@g.us');
        const sender = mek.key.participant || mek.key.remoteJid;
        const senderName = mek.pushName || "User";
        const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';

        // Extract body text
        let body = "";
        if (mek.message.conversation) body = mek.message.conversation;
        else if (mek.message.imageMessage?.caption) body = mek.message.imageMessage.caption;
        else if (mek.message.videoMessage?.caption) body = mek.message.videoMessage.caption;
        else if (mek.message.extendedTextMessage?.text) body = mek.message.extendedTextMessage.text;

        if (!body) return;

        // Load LIVE per-session settings (saved by onboarding portal), fall back to config.js
        let settings = {};
        try {
            if (sock.sessionId) {
                settings = (await getSettings(sock.sessionId)) || {};
            }
        } catch (e) {
            console.error("Could not load session settings, using config defaults:", e.message);
        }

        // Resolve effective config from DB settings -> config.js fallback
        const currentMode = settings.mode || config.mode || "private";
        const prefix = settings.prefix || config.prefix || ".";
        const ownerNumbers = settings.ownerNumber || []; // array from portal setup

        const isOwner = isOwnerCheck(sender, botId, ownerNumbers);

        // Parse prefix and command name
        const isCmd = body.startsWith(prefix);
        const args = body.slice(prefix.length).trim().split(/ +/);
        const command = isCmd ? args.shift().toLowerCase() : "";
        const text = args.join(" ");

        // Non-command behavior: AFK triggers & group media redirect
        if (!isCmd) {
            if (db.afk) {
                const mentions = mek.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
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

            if (isGroup && (mek.message.imageMessage || mek.message.videoMessage || mek.message.audioMessage)) {
                const channelUrl = config.channelUrl || "https://whatsapp.com/channel/0029VaI3OXiF6smuq5LxxN15";
                await sock.sendMessage(chatJid, {
                    text: `📢 *Shared Media Detected!* Join our official BOT-WAN channel to download original files & get updates: 
👉 ${channelUrl}`
                }, { quoted: mek });
            }

            await handleAgentReply(sock, mek, body, chatJid, sender, settings);
            return;
        }

        // Mode validation: in private mode, only the owner may run commands
        if (currentMode === "private" && !isOwner) {
            return; // Silently ignore non-owners in private mode
        }

        // Execute command
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
        }
    } catch (err) {
        console.error("Error in message handler:", err);
    }
}

module.exports = {
    handleMessage
};
