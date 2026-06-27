const config = require('../config');

module.exports = {
    // 👤 Update Profile Bio (Alias: setbio, sb)
    setbio: async ({ sock, chatJid, mek, text, isOwner }) => {
        if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ Owner only command!" }, { quoted: mek });
        if (!text) return sock.sendMessage(chatJid, { text: "❌ Provide text to set as bio status!" }, { quoted: mek });

        try {
            await sock.updateProfileStatus(text);
            await sock.sendMessage(chatJid, { text: `✅ Bio status updated successfully to:
_"${text}"_` }, { quoted: mek });
        } catch (err) {
            await sock.sendMessage(chatJid, { text: `❌ Failed: ${err.message}` }, { quoted: mek });
        }
    },
    sb: async (args) => module.exports.setbio(args),

    // 📛 Update Bot Display Name (Alias: setname, sn)
    setname: async ({ sock, chatJid, mek, text, isOwner }) => {
        if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ Owner only command!" }, { quoted: mek });
        if (!text) return sock.sendMessage(chatJid, { text: "❌ Provide name to set as profile display name!" }, { quoted: mek });

        try {
            await sock.updateProfileName(text);
            config.botName = text;
            await sock.sendMessage(chatJid, { text: `✅ Display name updated successfully to: *${text}*` }, { quoted: mek });
        } catch (err) {
            await sock.sendMessage(chatJid, { text: `❌ Failed: ${err.message}` }, { quoted: mek });
        }
    },
    sn: async (args) => module.exports.setname(args)
};