const config = require('../config');
const { updateSettings } = require('../lib/database');

// Resolve a target participant JID from: swipe-reply → mention → typed number.
function resolveTarget({ quotedSender, contextInfo, mek, args }) {
    const ctx = contextInfo || mek.message?.extendedTextMessage?.contextInfo || {};
    const replied = quotedSender || ctx.participant || null;
    const mentioned = ctx.mentionedJid?.[0] || null;
    const typedNum = args[0] ? args[0].replace(/[^0-9]/g, '') : "";
    const typed = typedNum ? typedNum + '@s.whatsapp.net' : null;
    return replied || mentioned || typed;
}

module.exports = {
    // 👥 Fetch Group Link (Alias: link, g-link)
    link: async ({ sock, chatJid, mek, isGroup }) => {
        if (!isGroup) return sock.sendMessage(chatJid, { text: "❌ This command can only be used in groups!" }, { quoted: mek });
        try {
            const code = await sock.groupInviteCode(chatJid);
            await sock.sendMessage(chatJid, { text: `🔗 *Group Invite Link:* 
https://chat.whatsapp.com/${code}` }, { quoted: mek });
        } catch (err) {
            await sock.sendMessage(chatJid, { text: `❌ Failed to retrieve link. Make sure the bot is an admin!` }, { quoted: mek });
        }
    },

    // 🚫 Kick Group Participant (Alias: kick) — reply, mention, or number
    kick: async ({ sock, chatJid, mek, isGroup, isOwner, args, quotedSender, contextInfo }) => {
        if (!isGroup) return sock.sendMessage(chatJid, { text: "❌ Group-only command!" }, { quoted: mek });
        if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ Admin/Owner privilege required!" }, { quoted: mek });

        const target = resolveTarget({ quotedSender, contextInfo, mek, args });
        if (!target) {
            return sock.sendMessage(chatJid, { text: "❌ Reply to, mention, or type a participant's number to kick!" }, { quoted: mek });
        }

        try {
            await sock.groupParticipantsUpdate(chatJid, [target], "remove");
            await sock.sendMessage(chatJid, {
                text: `✅ @${target.split('@')[0]} removed successfully.`,
                mentions: [target]
            }, { quoted: mek });
        } catch (err) {
            await sock.sendMessage(chatJid, { text: `❌ Failed: ${err.message}` }, { quoted: mek });
        }
    },

    // ⬆️ Promote to Admin (Alias: promote) — reply, mention, or number
    promote: async ({ sock, chatJid, mek, isGroup, isOwner, args, quotedSender, contextInfo }) => {
        if (!isGroup) return sock.sendMessage(chatJid, { text: "❌ Group-only command!" }, { quoted: mek });
        if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ Admin/Owner privilege required!" }, { quoted: mek });

        const target = resolveTarget({ quotedSender, contextInfo, mek, args });
        if (!target) {
            return sock.sendMessage(chatJid, { text: "❌ Reply to, mention, or type a participant's number to promote!" }, { quoted: mek });
        }

        try {
            await sock.groupParticipantsUpdate(chatJid, [target], "promote");
            await sock.sendMessage(chatJid, {
                text: `✅ @${target.split('@')[0]} is now an admin.`,
                mentions: [target]
            }, { quoted: mek });
        } catch (err) {
            await sock.sendMessage(chatJid, { text: `❌ Failed: ${err.message}` }, { quoted: mek });
        }
    },

    // ⬇️ Demote from Admin (Alias: demote) — reply, mention, or number
    demote: async ({ sock, chatJid, mek, isGroup, isOwner, args, quotedSender, contextInfo }) => {
        if (!isGroup) return sock.sendMessage(chatJid, { text: "❌ Group-only command!" }, { quoted: mek });
        if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ Admin/Owner privilege required!" }, { quoted: mek });

        const target = resolveTarget({ quotedSender, contextInfo, mek, args });
        if (!target) {
            return sock.sendMessage(chatJid, { text: "❌ Reply to, mention, or type a participant's number to demote!" }, { quoted: mek });
        }

        try {
            await sock.groupParticipantsUpdate(chatJid, [target], "demote");
            await sock.sendMessage(chatJid, {
                text: `✅ @${target.split('@')[0]} is no longer an admin.`,
                mentions: [target]
            }, { quoted: mek });
        } catch (err) {
            await sock.sendMessage(chatJid, { text: `❌ Failed: ${err.message}` }, { quoted: mek });
        }
    },

    // ➕ Add Group Participant (Alias: add)
    add: async ({ sock, chatJid, mek, isGroup, isOwner, args }) => {
        if (!isGroup) return sock.sendMessage(chatJid, { text: "❌ Group-only command!" }, { quoted: mek });
        if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ Admin/Owner privilege required!" }, { quoted: mek });

        const targetNumber = args[0]?.replace(/[^0-9]/g, '');
        if (!targetNumber) {
            return sock.sendMessage(chatJid, { text: "❌ Please specify a phone number with country code!" }, { quoted: mek });
        }

        try {
            const targetJid = targetNumber + '@s.whatsapp.net';
            await sock.groupParticipantsUpdate(chatJid, [targetJid], "add");
            await sock.sendMessage(chatJid, { text: `✅ Participant added successfully.` }, { quoted: mek });
        } catch (err) {
            await sock.sendMessage(chatJid, { text: `❌ Failed: ${err.message}` }, { quoted: mek });
        }
    },

    // 🔗 Antilink Control (Alias: antilink) — per-bot, per-group enforcement modes
    // Modes: off | warn | delete | kick
    antilink: async ({ sock, chatJid, mek, isGroup, isOwner, settings, text }) => {
        if (!isGroup) return sock.sendMessage(chatJid, { text: "❌ Group-only command!" }, { quoted: mek });
        if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ Admin/Owner privilege required!" }, { quoted: mek });

        const s = settings || {};
        const current = s.antilink || "off";
        const choice = (text || "").toLowerCase().trim();
        const valid = ["off", "warn", "delete", "kick"];

        // No argument → show status + help
        if (!choice) {
            return sock.sendMessage(chatJid, {
                text: `🔗 *Antilink Control* — current: *${current.toUpperCase()}*

👉 *.antilink off* — disable protection
👉 *.antilink warn* — warn the sender only
👉 *.antilink delete* — delete the link message
👉 *.antilink kick* — delete the message + remove the sender

⚠️ The bot must be a *group admin* for delete/kick to work.`
            }, { quoted: mek });
        }

        if (!valid.includes(choice)) {
            return sock.sendMessage(chatJid, { text: "❌ Invalid option. Use: off, warn, delete, or kick." }, { quoted: mek });
        }

        // Persist for THIS bot and keep the live socket cache in sync
        const merged = { ...s, antilink: choice };
        sock.botSettings = merged;
        if (sock.sessionId) {
            try { await updateSettings(sock.sessionId, { antilink: choice }); }
            catch (e) { console.error("antilink persist error:", e.message); }
        }

        const labels = {
            off: "🔕 Disabled — links are allowed.",
            warn: "⚠️ Warn only — senders get a warning.",
            delete: "🗑️ Delete — link messages will be removed.",
            kick: "🚫 Delete + Kick — link messages removed and sender ejected."
        };
        await sock.sendMessage(chatJid, { text: `✅ *Antilink set to:* *${choice.toUpperCase()}*
${labels[choice]}` }, { quoted: mek });
    }
};
