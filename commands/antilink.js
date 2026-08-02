const { getGroupMods, setGroupMod } = require('../lib/groupMods');

const VALID = ['off', 'delete', 'kick', 'warn'];

module.exports = {
  // 🛡️ Antilink — PER GROUP only (must run the command inside the target group)
  antilink: async ({ sock, chatJid, mek, text, isOwner, isGroup, settings }) => {
    if (!isOwner) {
      return sock.sendMessage(chatJid, { text: '❌ Owner/Admin only command!' }, { quoted: mek });
    }
    if (!isGroup) {
      return sock.sendMessage(chatJid, {
        text: '❌ Run *.antilink* inside the group you want to protect.\nSettings are stored per-group and do not leak to other groups.'
      }, { quoted: mek });
    }

    const mods = getGroupMods(settings, chatJid);
    // migrate legacy global setting only as display hint if this group has nothing set
    const current = mods.antilink || 'off';

    if (!text || !text.trim()) {
      return sock.sendMessage(chatJid, {
        text: `🛡️ *Antilink* (this group only)
Current: *${String(current).toUpperCase()}*

👉 *.antilink delete* — silently delete link messages
👉 *.antilink kick* — delete + remove sender
👉 *.antilink warn* — delete + warn (kick after limit)
👉 *.antilink off* — disable in this group

_Does not affect other groups. Bot must be admin to delete/kick._`
      }, { quoted: mek });
    }

    const choice = text.toLowerCase().trim().split(/\s+/)[0];
    if (!VALID.includes(choice)) {
      return sock.sendMessage(chatJid, { text: `❌ Invalid. Choose: ${VALID.join(', ')}` }, { quoted: mek });
    }

    await setGroupMod(sock, settings, chatJid, { antilink: choice });
    const labels = {
      off: 'disabled for this group',
      delete: 'ON — links will be *silently deleted*',
      kick: 'ON — links deleted and sender *removed*',
      warn: 'ON — links deleted and sender *warned*'
    };
    await sock.sendMessage(chatJid, { text: `✅ *Antilink* ${labels[choice]}.` }, { quoted: mek });
  },

  antilinkwarns: async ({ sock, chatJid, mek, text, isOwner, isGroup, settings }) => {
    if (!isOwner) return sock.sendMessage(chatJid, { text: '❌ Owner only!' }, { quoted: mek });
    if (!isGroup) return sock.sendMessage(chatJid, { text: '❌ Use inside a group.' }, { quoted: mek });
    const n = parseInt((text || '').replace(/[^0-9]/g, ''), 10);
    if (!n || n < 1) {
      return sock.sendMessage(chatJid, { text: '❌ Example: *.antilinkwarns 3*' }, { quoted: mek });
    }
    await setGroupMod(sock, settings, chatJid, { antilinkWarnLimit: n });
    await sock.sendMessage(chatJid, { text: `✅ This group will auto-kick after *${n}* antilink warnings.` }, { quoted: mek });
  }
};
