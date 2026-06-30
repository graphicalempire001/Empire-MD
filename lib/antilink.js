// lib/antilink.js — link detection & enforcement
const { db } = require('./database');

// Catches https/http links, chat.whatsapp.com invites, wa.me, and bare domains
const LINK_REGEX = /(https?:\/\/|www\.)\S+|chat\.whatsapp\.com\/\S+|wa\.me\/\S+|t\.me\/\S+|\b[a-z0-9-]+\.(com|net|org|io|me|xyz|link|info|biz|co)\b/i;

function containsLink(body) {
    if (!body) return false;
    return LINK_REGEX.test(body);
}

// Returns { botIsAdmin, senderIsAdmin } for a group chat
async function getAdminContext(sock, chatJid, senderJid) {
    try {
        const meta = await sock.groupMetadata(chatJid);
        const botNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        let botIsAdmin = false, senderIsAdmin = false;
        for (const p of meta.participants) {
            const admin = p.admin === 'admin' || p.admin === 'superadmin';
            if (p.id === botNumber && admin) botIsAdmin = true;
            if (p.id === senderJid && admin) senderIsAdmin = true;
        }
        return { botIsAdmin, senderIsAdmin };
    } catch (e) {
        return { botIsAdmin: false, senderIsAdmin: false };
    }
}

// Main entry. Returns true if the message was handled (so the caller can stop).
async function enforceAntilink({ sock, mek, chatJid, sender, body, isGroup, isOwner, settings
