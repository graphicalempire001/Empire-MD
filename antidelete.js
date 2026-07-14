const { updateSettings } = require('../lib/database');

module.exports = {
  // 🛡️ Antidelete: off | chat | dm  (Alias: ad, antidel)
  antidelete: async ({ sock, chatJid, mek, text, isOwner, settings }) => {
    if (!isOwner) {
      return sock.sendMessage(chatJid, { text: "❌ This is an owner-only command!" }, { quoted: mek });
    }
    const mode = (text || "").toLowerCase().trim();
    const valid = ["off", "chat", "dm"];
    if (!valid.includes(mode)) {
      const current = settings?.antidelete || "off";
      return sock.sendMessage(chatJid, {
        text:
`🛡️ *Antidelete Settings*
Current: *${current.toUpperCase()}*

👉 *.antidelete off*  — disable
👉 *.antidelete chat* — repost deleted messages in the same chat
👉 *.antidelete dm*   — send deleted messages to your DM`
      }, { quoted: mek });
    }

    const merged = { ...(settings || {}), antidelete: mode };
    sock.botSettings = merged; // update live cache instantly
    if (sock.sessionId) {
      try { await updateSettings(sock.sessionId, { antidelete: mode }); }
      catch (err) { console.error("Failed to persist antidelete:", err.message); }
    }

    await sock.sendMessage(chatJid, {
      text: `✅ *Antidelete* is now set to *${mode.toUpperCase()}*.`
    }, { quoted: mek });
  },
  ad: async (args) => module.exports.antidelete(args),
  antidel: async (args) => module.exports.antidelete(args)
};
