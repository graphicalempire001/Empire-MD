const config = require('../config');

module.exports = {
    // 👥 Fetch Group Link (Alias: link, g-link)
    link: async ({ sock, chatJid, mek, isGroup }) => {
        if (!isGroup) return sock.sendMessage(chatJid, { text: "❌ This command can only be used in groups!" }, { quoted: mek });
        try {
            const code = await sock.groupInviteCode(chatJid);
            await sock.sendMessage(chatJid, { text: `🔗 *Group Invite Link:* 
https://chat.whatsapp.com/${code}` }, { quoted: mek });
        } catch (err) {
            await sock.sendMessage(chatJid, { text: `❌ Failed to retrieve link. Make sure the bot is an admin!` }, { quoted: mek });
        }
    },

    // 🚫 Kick Group Participant (Alias: kick)
    kick: async ({ sock, chatJid, mek, isGroup, isOwner, args }) => {
        if (!isGroup) return sock.sendMessage(chatJid, { text: "❌ Group-only command!" }, { quoted: mek });
        if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ Admin/Owner privilege required!" }, { quoted: mek });
        
        const target = mek.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || args[0]?.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
        if (!target || target === '@s.whatsapp.net') {
            return sock.sendMessage(chatJid, { text: "❌ Mention or reply to a participant to kick!" }, { quoted: mek });
        }

        try {
            await sock.groupParticipantsUpdate(chatJid, [target], "remove");
            await sock.sendMessage(chatJid, { text: `✅ Participant removed successfully.` }, { quoted: mek });
        } catch (err) {
            await sock.sendMessage(chatJid, { text: `❌ Failed: ${err.message}` }, { quoted: mek });
        }
    },

    // ➕ Add Group Participant (Alias: add)
    add: async ({ sock, chatJid, mek, isGroup, isOwner, args }) => {
        if (!isGroup) return sock.sendMessage(chatJid, { text: "❌ Group-only command!" }, { quoted: mek });
        if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ Admin/Owner privilege required!" }, { quoted: mek });
        
        const targetNumber = args[0]?.replace(/[^0-9]/g, '');
        if (!targetNumber) {
            return sock.sendMessage(chatJid, { text: "❌ Please specify a phone number with country code!" }, { quoted: mek });
        }

        try {
            const targetJid = targetNumber + '@s.whatsapp.net';
            await sock.groupParticipantsUpdate(chatJid, [targetJid], "add");
            await sock.sendMessage(chatJid, { text: `✅ Participant added successfully.` }, { quoted: mek });
        } catch (err) {
            await sock.sendMessage(chatJid, { text: `❌ Failed: ${err.message}` }, { quoted: mek });
        }
    }
};