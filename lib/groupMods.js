// lib/groupMods.js — per-group moderation flags (antilink / antimention / greet)
const { updateSettings } = require('./database');

function getGroupMods(settings, chatJid) {
  const all = (settings && settings.groupMods) || {};
  return all[chatJid] || {};
}

async function setGroupMod(sock, settings, chatJid, patch) {
  const current = { ...(settings || {}) };
  const groupMods = { ...(current.groupMods || {}) };
  const prev = { ...(groupMods[chatJid] || {}) };
  groupMods[chatJid] = { ...prev, ...patch };
  current.groupMods = groupMods;
  sock.botSettings = current;
  if (sock.sessionId) {
    try {
      await updateSettings(sock.sessionId, { groupMods });
    } catch (e) {
      console.error('setGroupMod persist error:', e.message);
    }
  }
  return groupMods[chatJid];
}

async function isGroupAdmin(sock, chatJid, jid) {
  try {
    const meta = await sock.groupMetadata(chatJid);
    const botNum = sock.user.id.split(':')[0];
    const clean = (x) => String(x || '').replace(/[^0-9]/g, '');
    let botIsAdmin = false;
    let targetIsAdmin = false;
    for (const p of meta.participants) {
      const admin = p.admin === 'admin' || p.admin === 'superadmin';
      const pid = clean(p.id || p.jid || '');
      if (pid && pid === botNum && admin) botIsAdmin = true;
      if (pid && pid === clean(jid) && admin) targetIsAdmin = true;
    }
    return { botIsAdmin, targetIsAdmin };
  } catch (_) {
    return { botIsAdmin: false, targetIsAdmin: false };
  }
}

module.exports = { getGroupMods, setGroupMod, isGroupAdmin };
