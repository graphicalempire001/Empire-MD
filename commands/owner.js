const config = require('../config');

module.exports = {
    // ⚙️ Change Prefix (Alias: prefix, sp)
    setprefix: async ({ sock, chatJid, mek, text, isOwner }) => {
        if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ This is an owner-only command!" }, { quoted: mek });
        if (!text) return sock.sendMessage(chatJid, { text: "❌ Please provide a new prefix (e.g. .setprefix !)" }, { quoted: mek });
        config.prefix = text.trim();
        await sock.sendMessage(chatJid, { text: `✅ *Success:* Bot prefix has been successfully updated to: *${config.prefix}*` }, { quoted: mek });
    },
    sp: async (args) => module.exports.setprefix(args),

    // 🔒 Toggle Bot Mode: Public / Private (Alias: mode, setmode)
    setmode: async ({ sock, chatJid, mek, text, isOwner }) => {
        if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ This is an owner-only command!" }, { quoted: mek });
        if (!text || (text.toLowerCase() !== "public" && text.toLowerCase() !== "private")) {
            return sock.sendMessage(chatJid, { text: `❌ Invalid mode! Use:
👉 *.setmode public* to allow everyone to use commands
👉 *.setmode private* to restrict commands to owners only (Current: *${config.mode}*)` }, { quoted: mek });
        }
        config.mode = text.toLowerCase();
        await sock.sendMessage(chatJid, { text: `✅ *Bot Mode Updated:* The bot is now set to *${config.mode.toUpperCase()}* mode.` }, { quoted: mek });
    },
    mode: async (args) => module.exports.setmode(args),

    // 📣 Group Broadcast with Follow Channel button (Alias: bc, broadcast)
    broadcast: async ({ sock, chatJid, mek, text, isOwner }) => {
        if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ This is an owner-only command!" }, { quoted: mek });
        if (!text) return sock.sendMessage(chatJid, { text: "❌ Provide text to broadcast!" }, { quoted: mek });

        const channelUrl = config.channelUrl || "https://whatsapp.com/channel/0029VaI3OXiF6smuq5LxxN15";
        const message = `📢 *[EMPIRE MD OWNER BROADCAST]* 📢

${text}

━━━━━━━━━━━━━━━━━━━━
📢 *Stay Connected! Follow Our Channel:*
👉 ${channelUrl}
━━━━━━━━━━━━━━━━━━━━`;

        try {
            const groups = await sock.groupFetchAllParticipating();
            const groupJids = Object.keys(groups);
            
            await sock.sendMessage(chatJid, { text: `🚀 Starting owner broadcast to *${groupJids.length}* groups...` }, { quoted: mek });
            for (const jid of groupJids) {
                try {
                    await sock.sendMessage(jid, { text: message });
                } catch (err) {
                    console.error(`Failed to send broadcast to group: ${jid}`, err.message);
                }
            }
            await sock.sendMessage(chatJid, { text: "✅ Broadcast completed successfully!" }, { quoted: mek });
        } catch (err) {
            await sock.sendMessage(chatJid, { text: `❌ Broadcast failed: ${err.message}` }, { quoted: mek });
        }
    },
    bc: async (args) => module.exports.broadcast(args)
};