const config = require('../config');
const { updateSettings } = require('../lib/database');

module.exports = {
  // 👤 Update Profile Bio (Alias: setbio, sb) — this WhatsApp account only
  setbio: async ({ sock, chatJid, mek, text, isOwner }) => {
    if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ Owner only command!" }, { quoted: mek });
    if (!text) return sock.sendMessage(chatJid, { text: "❌ Provide text to set as bio status!" }, { quoted: mek });

    try {
      await sock.updateProfileStatus(text);
      // persist per session only (does not touch other bots)
      if (sock.sessionId) {
        try { await updateSettings(sock.sessionId, { botBio: text }); } catch (_) {}
      }
      if (sock.botSettings) sock.botSettings = { ...sock.botSettings, botBio: text };
      await sock.sendMessage(chatJid, {
        text: `✅ Bio updated for *this bot only*:\n_"${text}"_`
      }, { quoted: mek });
    } catch (err) {
      await sock.sendMessage(chatJid, { text: `❌ Failed: ${err.message}` }, { quoted: mek });
    }
  },
  sb: async (args) => module.exports.setbio(args),

  // 📛 Update Bot Display Name (Alias: setname, sn) — PER SESSION, never mutates global config
  setname: async ({ sock, chatJid, mek, text, isOwner, settings }) => {
    if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ Owner only command!" }, { quoted: mek });
    if (!text) return sock.sendMessage(chatJid, { text: "❌ Provide a name, e.g. *.setname Empire Helper*" }, { quoted: mek });

    const name = text.trim().slice(0, 25); // WA display name limit-ish
    try {
      // Change WhatsApp profile name for THIS linked device/session only
      await sock.updateProfileName(name);

      // Persist to this session's settings — do NOT write config.botName (that leaks to all bots)
      const patch = { botName: name };
      sock.botSettings = { ...(settings || sock.botSettings || {}), ...patch };
      if (sock.sessionId) {
        try { await updateSettings(sock.sessionId, patch); }
        catch (e) { console.error("setname persist:", e.message); }
      }

      await sock.sendMessage(chatJid, {
        text: `✅ Display name set to *${name}*\n_This change applies only to this bot/session — other bots are unaffected._`
      }, { quoted: mek });
    } catch (err) {
      await sock.sendMessage(chatJid, { text: `❌ Failed: ${err.message}` }, { quoted: mek });
    }
  },
  sn: async (args) => module.exports.setname(args)
};
