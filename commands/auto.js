const config = require('../config');
const { updateSettings } = require('../lib/database');

// Shared random-emoji pool
const RANDOM_STATUS_EMOJIS = ["💖","🔥","😂","😍","👏","🎉","💯","👍","🙌","✨","😎","🥰","⚡","🌟","💪","👀","🤩","❤️","😮","🚀"];
function pickRandomEmoji() {
  return RANDOM_STATUS_EMOJIS[Math.floor(Math.random() * RANDOM_STATUS_EMOJIS.length)];
}

// Helper: persist one or more setting changes for THIS bot, and keep the live socket in sync.
async function persist(sock, settings, patch) {
  const merged = { ...(settings || {}), ...patch };
  sock.botSettings = merged; // live session reflects change instantly
  if (sock.sessionId) {
    try { await updateSettings(sock.sessionId, patch); } catch (e) { console.error("persist error:", e.message); }
  }
  return merged;
}

module.exports = {
  RANDOM_STATUS_EMOJIS,
  pickRandomEmoji,

  // ⚙️ Auto Presence Settings (Alias: auto, presence)
  auto: async ({ sock, chatJid, mek, text, isOwner, settings }) => {
    if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ Owner only command!" }, { quoted: mek });
    const s = settings || {};
    if (!text) {
      return sock.sendMessage(chatJid, { text: `🤖 *Auto Presence Control (per-bot):*
👉 *.auto typing* - Toggle typing indicator (now: ${s.auttyping ? "ON" : "OFF"})
👉 *.auto recording* - Toggle recording indicator (now: ${s.autorecord ? "ON" : "OFF"})
👉 *.auto online* - Toggle always-online (now: ${s.alwaysOnline ? "ON" : "OFF"})` }, { quoted: mek });
    }
    const choice = text.toLowerCase().trim();
    if (choice === "typing") {
      const v = !s.auttyping;
      await persist(sock, s, { auttyping: v });
      await sock.sendMessage(chatJid, { text: `✅ *Auto Typing:* *${v ? "ON" : "OFF"}*` }, { quoted: mek });
    } else if (choice === "recording") {
      const v = !s.autorecord;
      await persist(sock, s, { autorecord: v });
      await sock.sendMessage(chatJid, { text: `✅ *Auto Recording:* *${v ? "ON" : "OFF"}*` }, { quoted: mek });
    } else if (choice === "online") {
      const v = !s.alwaysOnline;
      await persist(sock, s, { alwaysOnline: v });
      await sock.sendMessage(chatJid, { text: `✅ *Always Online:* *${v ? "ON" : "OFF"}*` }, { quoted: mek });
    } else {
      await sock.sendMessage(chatJid, { text: "❌ Invalid option! Choose: typing, recording, or online" }, { quoted: mek });
    }
  },
  presence: async (args) => module.exports.auto(args),

  // 👁️ Toggle auto-view statuses (per-bot). Alias: asv
  autostatusview: async ({ sock, chatJid, mek, isOwner, settings }) => {
    if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ Owner only command!" }, { quoted: mek });
    const v = !(settings?.autostatusview);
    await persist(sock, settings, { autostatusview: v });
    await sock.sendMessage(chatJid, { text: `✅ *Auto Status View:* *${v ? "ON" : "OFF"}*` }, { quoted: mek });
  },
  asv: async (args) => module.exports.autostatusview(args),

  // 💖 Toggle auto-react to statuses (per-bot). Alias: asr
  //  .autostatusreact          → toggle on/off (random emoji mode)
  //  .autostatusreact 🔥       → turn on with a FIXED emoji
  //  .autostatusreact random   → force random-emoji mode on
  autostatusreact: async ({ sock, chatJid, mek, isOwner, settings, text }) => {
    if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ Owner only command!" }, { quoted: mek });
    const arg = (text || "").trim();
    const patch = {};

    if (arg.toLowerCase() === "random" || arg === "") {
      patch.defaultStatusEmoji = null; // null = random mode
      patch.autostatusreact = arg ? true : !(settings?.autostatusreact);
    } else {
      patch.defaultStatusEmoji = arg; // fixed emoji
      patch.autostatusreact = true;
    }

    await persist(sock, settings, patch);
    const modeText = patch.autostatusreact
      ? (patch.defaultStatusEmoji ? `ON (fixed ${patch.defaultStatusEmoji})` : "ON (random emojis)")
      : "OFF";
    await sock.sendMessage(chatJid, { text: `✅ *Auto Status React:* *${modeText}*` }, { quoted: mek });
  },
  asr: async (args) => module.exports.autostatusreact(args)
};
