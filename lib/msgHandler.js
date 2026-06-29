// Empire MD - Core Message Handler (Improved Owner Detection + Debugging)
const config = require('../config');
const { getSettings, db } = require('./database');
const commands = require('./commands');

// Helper to check if a number is owner (More reliable matching)
function isOwnerCheck(sender, botId, customOwners = []) {
    const cleanSender = sender.replace(/[^0-9]/g, '');
    const cleanBot = botId.replace(/[^0-9]/g, '');

    // Bot's own number is always owner
    if (cleanSender === cleanBot) return true;

    // Merge owners from DB + config
    const owners = [
        ...(Array.isArray(customOwners) ? customOwners : []),
        ...((config.ownerNumber && Array.isArray(config.ownerNumber)) ? config.ownerNumber : [])
    ];

    return owners.some(owner => {
        const cleanOwner = String(owner).replace(/[^0-9]/g, '');
        if (!cleanOwner) return false;

        // Flexible matching: exact or last 8-10 digits (handles country code issues)
        return cleanSender === cleanOwner || 
               cleanSender.endsWith(cleanOwner) || 
               cleanOwner.endsWith(cleanSender);
    });
}

// Automatic smart replies when not a command
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

        // Extract body text (improved)
        let body = "";
        if (mek.message.conversation) body = mek.message.conversation;
        else if (mek.message.imageMessage?.caption) body = mek.message.imageMessage.caption;
        else if (mek.message.videoMessage?.caption) body = mek.message.videoMessage.caption;
        else if (mek.message.extendedTextMessage?.text) body = mek.message.extendedTextMessage.text;
        else if (mek.message.documentMessage?.caption) body = mek.message.documentMessage.caption;

        if (!body || body.trim() === "") return;

        // Load per-session settings
        let settings = {};
        try {
            if (sock.sessionId) {
                settings = (await getSettings(sock.sessionId)) || {};
            }
        } catch (e) {
            console.error("Could not load session settings, using config defaults:", e.message);
        }

        // Resolve effective config
        const currentMode = settings.mode || config.mode || "private";
        const prefix = settings.prefix || config.prefix || ".";
        const ownerNumbers = settings.ownerNumber || [];

        const isOwner = isOwnerCheck(sender, botId, ownerNumbers);

        // === DEBUG LOG (remove after testing) ===
        console.log(`[DEBUG] Session: ${sock.sessionId} | Sender: ${sender} | IsOwner: ${isOwner} | Mode: ${currentMode} | Prefix: ${prefix} | Command: ${body}`);

        // Parse command
        const isCmd = body.startsWith(prefix);
        const args = body.slice(prefix.length).trim().split(/ +/);
        const command = isCmd ? args.shift().toLowerCase() : "";
        const text = args.join(" ");

        // Non-command behavior
        if (!isCmd) {
            if (db.afk) {
                const mentions = mek.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                for (const jid of mentions) {
                    if (db.afk[jid]) {
                        const afkData = db.afk[jid];
                        await sock.sendMessage(chatJid, {
                            text: `🔔 *[AFK MODE]* @${jid.split('@')[0]} is Away.\n*Reason:* ${afkData.reason}\n*Since:* ${new Date(afkData.time).toLocaleTimeString()}`,
                            mentions: [jid]
                        }, { quoted: mek });
                    }
                }
            }

            if (isGroup && (mek.message.imageMessage || mek.message.videoMessage || mek.message.audioMessage)) {
                const channelUrl = config.channelUrl || "https://whatsapp.com/channel/0029VaI3OXiF6smuq5LxxN15";
                await sock.sendMessage(chatJid, {
                    text: `📢 *Shared Media Detected!* Join our official BOT-WAN channel:\n👉 ${channelUrl}`
                }, { quoted: mek });
            }

            await handleAgentReply(sock, mek, body, chatJid, sender, settings);
            return;
        }

        // Private mode: only owner can run commands
        if (currentMode === "private" && !isOwner) {
            return; // Silent ignore
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
