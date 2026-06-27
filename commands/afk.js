const { db } = require('../lib/database');

module.exports = {
    // 🔔 Away From Keyboard (Alias: afk)
    afk: async ({ sock, chatJid, mek, sender, text }) => {
        if (!db.afk) db.afk = {};
        
        const reason = text ? text.trim() : "Away from keyboard, back soon!";
        db.afk[sender] = {
            reason: reason,
            time: Date.now()
        };

        const mentionUser = `@${sender.split('@')[0]}`;
        const message = `🔔 *[AFK MODE ENABLED]*

👤 *User:* ${mentionUser}
📝 *Reason:* ${reason}
🕒 *Time:* ${new Date().toLocaleTimeString()}

_Bot will automatically notify anyone who mentions you!_`;

        await sock.sendMessage(chatJid, {
            text: message,
            mentions: [sender]
        }, { quoted: mek });
    }
};