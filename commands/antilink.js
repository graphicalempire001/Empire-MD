const config = require('../config');
const { updateSettings } = require('../lib/database');

// Persist a setting change for THIS bot + keep the live socket in sync (same pattern as auto.js)
async function persist(sock, settings, patch) {
    const merged = { ...(settings || {}), ...patch };
    sock.botSettings = merged;
    if (sock.sessionId) {
        try { await updateSettings(sock.sessionId, patch); } catch (e) { console.error("persist error:", e.message); }
    }
    return merged;
}

const VALID = ['off', 'delete', 'kick', 'warn'];

module.exports = {
    // 🛡️ Antilink control (per-bot, group-only enforcement)
    // .antilink            → show status + options
    // .antilink delete     → delete link messages
    // .antilink kick       → delete + remove the sender
    // .antilink warn       → delete + warn (kick after N warns)
    // .antilink off        → disable
    antilink: async ({ sock, chatJid, mek, text, isOwner, settings }) => {
        if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ Owner/Admin only command!" }, { quoted: mek });

        const s = settings || {};
        const current = typeof s.antilink === 'string' ? s.antilink : (s.antilink ? 'delete' : 'off');

        if (!text || !text.trim()) {
            return sock.sendMessage(chatJid, {
                text: `🛡️ *Antilink Control (per-bot)*
Current mode: *${current.toUpperCase()}*

👉 *.antilink delete* — delete any link message
👉 *.antilink kick* — delete the link and remove the sender
👉 *.antilink warn* — delete + warn (auto-kick after ${s.antilinkWarnLimit || 3} warns)
👉 *.antilink off* — disable

_Note: the bot must be a group admin to delete or kick._`
            }, { quoted: mek });
        }

        const choice = text.toLowerCase().trim();
        if (!VALID.includes(choice)) {
            return sock.sendMessage(chatJid, { text: `❌ Invalid option! Choose: ${VALID.join(', ')}` }, { quoted: mek });
        }

        await persist(sock, s, { antilink: choice });
        const labels = {
            off: "disabled",
            delete: "enabled — links will be *deleted*",
            kick: "enabled — links will be *deleted* and the sender *removed*",
            warn: "enabled — links will be *deleted* and the sender *warned*"
        };
        await sock.sendMessage(chatJid, { text: `✅ *Antilink ${labels[choice]}*.` }, { quoted: mek });
    },

    // Optional: set how many warns before a kick in "warn" mode → .antilinkwarns 5
    antilinkwarns: async ({ sock, chatJid, mek, text, isOwner, settings }) => {
        if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ Owner/Admin only command!" }, { quoted: mek });
        const n = parseInt((text || '').replace(/[^0-9]/g, ''), 10);
        if (!n || n < 1) return sock.sendMessage(chatJid, { text: "❌ Provide a number, e.g. *.antilinkwarns 3*" }, { quoted: mek });
        await persist(sock, settings, { antilinkWarnLimit: n });
        await sock.sendMessage(chatJid, { text: `✅ Antilink will auto-kick after *${n}* warnings.` }, { quoted: mek });
    }
};
