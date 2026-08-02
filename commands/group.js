const config = require('../config');
const { updateSettings } = require('../lib/database');
const { getGroupMods, setGroupMod } = require('../lib/groupMods');

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

    // 🚫 Anti STATUS-mention — PER GROUP.
    // Normal @tags in the group stay allowed. Only WhatsApp *status mention*
    // notifications that appear in the group are silently deleted.
    antimention: async ({ sock, chatJid, mek, text, isOwner, isGroup, settings }) => {
        if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ Owner only!" }, { quoted: mek });
        if (!isGroup) {
            return sock.sendMessage(chatJid, {
                text: "❌ Run *.antimention* inside the group you want to protect."
            }, { quoted: mek });
        }
        const mods = getGroupMods(settings, chatJid);
        const arg = (text || "").toLowerCase().trim();
        let next;
        if (arg === "on" || arg === "enable") next = true;
        else if (arg === "off" || arg === "disable") next = false;
        else next = !mods.antimention;

        await setGroupMod(sock, settings, chatJid, { antimention: next });
        await sock.sendMessage(chatJid, {
            text: next
                ? "✅ *Anti status-mention ON* for this group.\nStatus mentions are deleted instantly. Normal @tags in chat are still allowed."
                : "✅ *Anti status-mention OFF* for this group."
        }, { quoted: mek });
    },
    am: async (args) => module.exports.antimention(args),
    antistatusmention: async (args) => module.exports.antimention(args),

    // 🏷️ .tag — notify everyone WITHOUT listing each @name (hidden mention)
    // Usage: .tag  or  .tag Please read the rules
    tag: async ({ sock, chatJid, mek, isGroup, isOwner, text }) => {
        if (!isGroup) return sock.sendMessage(chatJid, { text: "❌ Group-only command!" }, { quoted: mek });
        if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ Admin/Owner only!" }, { quoted: mek });
        try {
            const meta = await sock.groupMetadata(chatJid);
            const jids = meta.participants.map(p => p.id).filter(Boolean);
            const msg = (text && text.trim()) ? text.trim() : "📢";
            // Mentions array notifies all members; body does not print every @number
            await sock.sendMessage(chatJid, { text: msg, mentions: jids }, { quoted: mek });
        } catch (err) {
            await sock.sendMessage(chatJid, { text: `❌ Failed: ${err.message}` }, { quoted: mek });
        }
    },

    // 👋 Group greet / welcome — PER GROUP (fires when someone joins)
    greet: async ({ sock, chatJid, mek, text, isOwner, isGroup, settings }) => {
        if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ Owner only!" }, { quoted: mek });
        if (!isGroup) {
            return sock.sendMessage(chatJid, {
                text: "❌ Run *.greet* inside the group where you want welcome messages.\nIt will not leak to other groups."
            }, { quoted: mek });
        }
        const mods = getGroupMods(settings, chatJid);
        const arg = (text || "").trim();
        const low = arg.toLowerCase();

        if (!arg) {
            return sock.sendMessage(chatJid, {
                text: `👋 *Group Greet* (this group only)
Status: *${mods.greet ? "ON" : "OFF"}*
Message: ${mods.greetText || "(default)"}

👉 *.greet on* / *.greet off*
👉 *.greet Hello @user welcome!* — set custom text
   Use *@user* where the new member should be mentioned.`
            }, { quoted: mek });
        }

        if (low === "on" || low === "enable") {
            await setGroupMod(sock, settings, chatJid, { greet: true });
            return sock.sendMessage(chatJid, { text: "✅ *Greet ON* for this group only." }, { quoted: mek });
        }
        if (low === "off" || low === "disable") {
            await setGroupMod(sock, settings, chatJid, { greet: false });
            return sock.sendMessage(chatJid, { text: "✅ *Greet OFF* for this group." }, { quoted: mek });
        }

        // custom text
        await setGroupMod(sock, settings, chatJid, { greet: true, greetText: arg });
        await sock.sendMessage(chatJid, {
            text: `✅ *Greet ON* with custom message:\n_${arg}_`
        }, { quoted: mek });
    },
    welcome: async (args) => module.exports.greet(args),
    autogreet: async (args) => module.exports.greet(args)
};

