const { updateSettings } = require('../lib/database');

async function persist(sock, settings, patch) {
  const merged = { ...(settings || {}), ...patch };
  sock.botSettings = merged;
  if (sock.sessionId) {
    try { await updateSettings(sock.sessionId, patch); }
    catch (e) { console.error("anticall persist:", e.message); }
  }
  return merged;
}

function normalizeJid(input) {
  if (!input) return null;
  let s = String(input).trim();
  if (s.includes("@")) {
    s = s.split("@")[0].replace(/\D/g, "");
  } else {
    s = s.replace(/\D/g, "");
  }
  if (!s || s.length < 8) return null;
  return s + "@s.whatsapp.net";
}

function getList(settings) {
  const list = settings?.anticallList;
  return Array.isArray(list) ? list.map(String) : [];
}

module.exports = {
  // 📵 Anti-Call (Alias: at, anticall)
  //  .anticall / .at              → status + help
  //  .anticall all                → reject EVERY incoming call
  //  .anticall list               → reject only numbers on the block list
  //  .anticall off                → disable
  //  .anticall add 234xxx | @user → add to block list (and switch to list mode)
  //  .anticall del 234xxx | @user → remove from block list
  //  .anticall clear              → empty block list
  anticall: async ({ sock, chatJid, mek, text, isOwner, settings, contextInfo }) => {
    if (!isOwner) {
      return sock.sendMessage(chatJid, { text: "❌ Owner only command!" }, { quoted: mek });
    }

    const s = settings || sock.botSettings || {};
    const mode = s.anticallMode || "off"; // off | all | list
    const list = getList(s);
    const arg = (text || "").trim();
    const low = arg.toLowerCase();
    const parts = arg.split(/\s+/).filter(Boolean);

    if (!arg) {
      return sock.sendMessage(chatJid, {
        text: `📵 *Anti-Call*
Status: *${mode.toUpperCase()}*
Block list: *${list.length}* number(s)

👉 *.anticall all* — reject every call (no ring)
👉 *.anticall list* — reject only listed numbers
👉 *.anticall off* — allow all calls
👉 *.anticall add 2348012345678* — add number
👉 *.anticall add* (reply/mention) — add that user
👉 *.anticall del 234...* — remove number
👉 *.anticall clear* — empty list

_Alias: .at_`
      }, { quoted: mek });
    }

    if (low === "all" || low === "on") {
      await persist(sock, s, { anticallMode: "all" });
      return sock.sendMessage(chatJid, {
        text: "✅ *Anti-Call: ALL*\nEvery incoming call will be rejected (no ring)."
      }, { quoted: mek });
    }

    if (low === "off" || low === "disable") {
      await persist(sock, s, { anticallMode: "off" });
      return sock.sendMessage(chatJid, {
        text: "✅ *Anti-Call: OFF*\nCalls are allowed again."
      }, { quoted: mek });
    }

    if (low === "list" || low === "blocklist") {
      await persist(sock, s, { anticallMode: "list" });
      const preview = list.length
        ? list.map((j, i) => `${i + 1}. ${j.replace("@s.whatsapp.net", "")}`).join("\n")
        : "_empty — use .anticall add_";
      return sock.sendMessage(chatJid, {
        text: `✅ *Anti-Call: LIST mode*\nOnly listed numbers are rejected.\n\n${preview}`
      }, { quoted: mek });
    }

    if (low === "clear") {
      await persist(sock, s, { anticallList: [], anticallMode: mode === "off" ? "list" : mode });
      return sock.sendMessage(chatJid, { text: "✅ Anti-call list cleared." }, { quoted: mek });
    }

    const cmd = (parts[0] || "").toLowerCase();
    if (cmd === "add" || cmd === "del" || cmd === "remove" || cmd === "rm") {
      // resolve target: reply → mention → typed number
      let target =
        mek.message?.extendedTextMessage?.contextInfo?.participant ||
        contextInfo?.participant ||
        null;
      const mentioned = contextInfo?.mentionedJid || mek.message?.extendedTextMessage?.contextInfo?.mentionedJid;
      if (!target && mentioned && mentioned[0]) target = mentioned[0];
      if (!target && parts[1]) target = normalizeJid(parts.slice(1).join(""));
      else if (target) target = normalizeJid(target);

      if (!target) {
        return sock.sendMessage(chatJid, {
          text: "❌ Provide a number, mention someone, or reply to their message.\nExample: *.anticall add 2348012345678*"
        }, { quoted: mek });
      }

      let nextList = getList(s);
      if (cmd === "add") {
        if (!nextList.includes(target)) nextList.push(target);
        await persist(sock, s, { anticallList: nextList, anticallMode: "list" });
        return sock.sendMessage(chatJid, {
          text: `✅ Added *${target.replace("@s.whatsapp.net", "")}* to anti-call list.\nMode: *LIST* (${nextList.length} numbers)`
        }, { quoted: mek });
      } else {
        nextList = nextList.filter((j) => j !== target);
        await persist(sock, s, { anticallList: nextList });
        return sock.sendMessage(chatJid, {
          text: `✅ Removed *${target.replace("@s.whatsapp.net", "")}* from list.\nRemaining: *${nextList.length}*`
        }, { quoted: mek });
      }
    }

    return sock.sendMessage(chatJid, {
      text: "❌ Unknown option. Use: all | list | off | add | del | clear"
    }, { quoted: mek });
  },
  at: async (args) => module.exports.anticall(args),
};

