// Empire MD - Core Message Handler
const config = require('../config');
const { getSettings, db } = require('./database');
const commands = require('./commands');

// Helper to check if a number is owner
function isOwnerCheck(sender, botId) {
    const cleanSender = sender.replace(/[^0-9]/g, '');
    const cleanBot = botId.replace(/[^0-9]/g, '');
    if (cleanSender === cleanBot) return true;
    
    return config.ownerNumber.some(owner => {
        const cleanOwner = owner.replace(/[^0-9]/g, '');
        return cleanSender.includes(cleanOwner);
    });
}

// Automatic smart replies/AI agent when not a command
async function handleAgentReply(sock, mek, body, chatJid, sender) {
    if (config.settings.autoreply && !chatJid.endsWith('@g.us')) {
        await sock.sendMessage(chatJid, { text: "🤖 *[Empire MD Auto-Response]* Thank you for reaching out! The owner is currently away. Please use .help to see available commands." }, { quoted: mek });
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

        const isOwner = isOwnerCheck(sender, botId);
        
        // Private / Public Mode check
        const currentMode = config.mode || "private";
        
        // Parse Prefix and Command names
        const prefix = config.prefix || ".";
        const isCmd = body.startsWith(prefix);
        const args = body.slice(prefix.length).trim().split(/ +/);
        const command = isCmd ? args.shift().toLowerCase() : "";
        const text = args.join(" ");

        // Non-command behavior: Group Media Button redirect & AFK triggers
        if (!isCmd) {
            // Check if anyone mentioned is AFK
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
            
            // On group media in groups: append follow channel button redirects (BOT-WAN Channel Link)
            if (isGroup && (mek.message.imageMessage || mek.message.videoMessage || mek.message.audioMessage)) {
                const channelUrl = config.channelUrl || "https://whatsapp.com/channel/0029VaI3OXiF6smuq5LxxN15";
                await sock.sendMessage(chatJid, {
                    text: `📢 *Shared Media Detected!* Join our official BOT-WAN channel to download original files & get updates: 
👉 ${channelUrl}`
                }, { quoted: mek });
            }

            await handleAgentReply(sock, mek, body, chatJid, sender);
            return;
        }

        // Mode validation: Private bot by default
        if (currentMode === "private" && !isOwner) {
            return; // Ignore completely if private mode and not owner
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
                prefix
            });
        }
    } catch (err) {
        console.error("Error in message handler:", err);
    }
}

module.exports = {
    handleMessage
};