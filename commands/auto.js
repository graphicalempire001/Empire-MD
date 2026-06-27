const config = require('../config');

module.exports = {
    // ⚙️ Auto Presence Settings (Alias: auto, presence)
    auto: async ({ sock, chatJid, mek, text, isOwner }) => {
        if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ Owner only command!" }, { quoted: mek });
        if (!text) {
            return sock.sendMessage(chatJid, { text: `🤖 *Auto Presence Control:*
👉 *.auto typing* - Toggles automatic typing indicator
👉 *.auto recording* - Toggles automatic audio recording indicator
👉 *.auto online* - Toggles always-online presence` }, { quoted: mek });
        }

        const choice = text.toLowerCase().trim();
        if (choice === "typing") {
            config.settings.auttyping = !config.settings.auttyping;
            await sock.sendMessage(chatJid, { text: `✅ *Auto Typing:* Set to *${config.settings.auttyping ? "ON" : "OFF"}*` }, { quoted: mek });
        } else if (choice === "recording") {
            config.settings.autorecord = !config.settings.autorecord;
            await sock.sendMessage(chatJid, { text: `✅ *Auto Recording:* Set to *${config.settings.autorecord ? "ON" : "OFF"}*` }, { quoted: mek });
        } else if (choice === "online") {
            config.settings.alwaysOnline = !config.settings.alwaysOnline;
            await sock.sendMessage(chatJid, { text: `✅ *Always Online:* Set to *${config.settings.alwaysOnline ? "ON" : "OFF"}*` }, { quoted: mek });
        } else {
            await sock.sendMessage(chatJid, { text: "❌ Invalid option! Choose: typing, recording, or online" }, { quoted: mek });
        }
    }
};