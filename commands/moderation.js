const config = require('../config');

module.exports = {
    // 🔒 Group Close (Mute Group) (Alias: close)
    close: async ({ sock, chatJid, mek, isGroup, isOwner }) => {
        if (!isGroup) return sock.sendMessage(chatJid, { text: "❌ Group-only command!" }, { quoted: mek });
        if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ Admin privilege required!" }, { quoted: mek });

        try {
            await sock.groupSettingUpdate(chatJid, 'announcement');
            await sock.sendMessage(chatJid, { text: "🔒 *Group Closed:* Only Admins can send messages now." }, { quoted: mek });
        } catch (err) {
            await sock.sendMessage(chatJid, { text: `❌ Failed: ${err.message}` }, { quoted: mek });
        }
    },

    // 🔓 Group Open (Unmute Group) (Alias: open)
    open: async ({ sock, chatJid, mek, isGroup, isOwner }) => {
        if (!isGroup) return sock.sendMessage(chatJid, { text: "❌ Group-only command!" }, { quoted: mek });
        if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ Admin privilege required!" }, { quoted: mek });

        try {
            await sock.groupSettingUpdate(chatJid, 'not_announcement');
            await sock.sendMessage(chatJid, { text: "🔓 *Group Opened:* All participants can send messages now." }, { quoted: mek });
        } catch (err) {
            await sock.sendMessage(chatJid, { text: `❌ Failed: ${err.message}` }, { quoted: mek });
        }
    },

    // 📣 Tag All Members (Alias: tagall, everyone)
    tagall: async ({ sock, chatJid, mek, isGroup, isOwner, text }) => {
        if (!isGroup) return sock.sendMessage(chatJid, { text: "❌ Group-only command!" }, { quoted: mek });
        if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ Admin privilege required!" }, { quoted: mek });

        try {
            const groupMetadata = await sock.groupMetadata(chatJid);
            const participants = groupMetadata.participants;
            const jids = participants.map(p => p.id);
            
            let message = `📣 *HELLO* 📣
📝 *Notice:* ${text || "Attention everyone!"}

`;
            participants.forEach((p, idx) => {
                message += `${idx + 1}. @${p.id.split('@')[0]}
`;
            });

            await sock.sendMessage(chatJid, { text: message, mentions: jids }, { quoted: mek });
        } catch (err) {
            await sock.sendMessage(chatJid, { text: `❌ Failed: ${err.message}` }, { quoted: mek });
        }
    },
    everyone: async (args) => module.exports.tagall(args)
};
