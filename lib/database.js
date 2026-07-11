// Empire MD - Supabase Database Layer & Multi-user Registry (Improved + Per-Bot Owner + Admin + AI Memory)
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
}

const db = {
  settings: {},
  afk: {},
  aiMemory: {}
};

// --- Duplicate-name guard -------------------------------------------
async function isBotNameTaken(botName) {
  const name = String(botName || '').trim().toLowerCase();
  if (!name) return false;
  if (!supabase) {
    return Object.values(db.settings)
      .some(s => String(s.botName || '').trim().toLowerCase() === name);
  }
  try {
    const { data, error } = await supabase
      .from('bot_registry')
      .select('session_id')
      .ilike('bot_name', name)
      .limit(1);
    if (error) throw error;
    return !!(data && data.length);
  } catch (e) {
    console.error("isBotNameTaken failed:", e);
    return false;
  }
}

// Register or update bot
async function registerBot(sessionId, botName, phoneNumber, ownerNumber) {
  const cleanPhone = String(phoneNumber || '').replace(/[^0-9]/g, '');
  const cleanOwner = String(ownerNumber || phoneNumber || '').replace(/[^0-9]/g, '');
  if (!cleanOwner) {
    console.error(`[DB] No owner/phone number provided for session ${sessionId}`);
  }

  const defaultSettings = {
    botName: botName || "Empire MD",
    prefix: '.',
    mode: 'private',
    alwaysOnline: true,
    welcome: true,
    ownerNumber: cleanOwner ? [cleanOwner] : []
  };

  if (!supabase) {
    const name = String(botName || '').trim().toLowerCase();
    const dup = Object.entries(db.settings)
      .some(([sid, s]) => sid !== sessionId &&
        String(s.botName || '').trim().toLowerCase() === name);
    if (dup) return { ok: false, code: '23505', error: 'Bot name already taken.' };
    db.settings[sessionId] = {
      botName: botName || "Empire MD",
      phoneNumber: cleanPhone,
      status: 'online',
      created_at: new Date(),
      message_count: db.settings[sessionId]?.message_count || 0,
      last_active: new Date(),
      is_abusive: false,
      settings: defaultSettings
    };
    console.log(`[DB] In-memory owner set: ${cleanOwner}`);
    return { ok: true };
  }

  try {
    const { error } = await supabase
      .from('bot_registry')
      .upsert({
        session_id: sessionId,
        bot_name: botName || "Empire MD",
        phone_number: cleanPhone,
        status: 'online',
        created_at: new Date(),
        settings: defaultSettings
      }, { onConflict: 'session_id' });
    if (error) {
      console.error("Database registration error:", error.message);
      if (error.code === '23505') {
        return { ok: false, code: '23505', error: 'Bot name already taken.' };
      }
      return { ok: false, code: error.code, error: error.message };
    }
    console.log(`[DB SUCCESS] Owner saved for ${sessionId} → ${cleanOwner}`);
    return { ok: true };
  } catch (e) {
    console.error("registerBot failed:", e);
    return { ok: false, code: e.code, error: e.message };
  }
}

// Get public bots
async function getPublicBots() {
  if (!supabase) {
    return Object.keys(db.settings).map(sid => ({
      session_id: sid,
      bot_name: db.settings[sid].botName || "Empire Bot",
      phone_number: db.settings[sid].phoneNumber || "Unknown",
      status: db.settings[sid].status || "offline",
      created_at: db.settings[sid].created_at || new Date()
    }));
  }
  try {
    const { data, error } = await supabase
      .from('bot_registry')
      .select('session_id, bot_name, phone_number, status, created_at')
      .eq('status', 'online')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error("getPublicBots failed:", e);
    return [];
  }
}

async function getSettings(sessionId) {
  if (!supabase) return db.settings[sessionId]?.settings || {};
  try {
    const { data, error } = await supabase
      .from('bot_registry')
      .select('settings')
      .eq('session_id', sessionId)
      .single();
    if (error) throw error;
    return data?.settings || {};
  } catch (e) {
    console.error("DB read error:", e);
    return {};
  }
}

async function updateSettings(sessionId, newSettings) {
  if (!supabase) {
    if (!db.settings[sessionId]) db.settings[sessionId] = {};
    db.settings[sessionId].settings = {
      ...(db.settings[sessionId].settings || {}),
      ...newSettings
    };
    return;
  }
  try {
    const current = await getSettings(sessionId);
    const merged = { ...current, ...newSettings };
    await supabase
      .from('bot_registry')
      .update({ settings: merged, status: 'online' })
      .eq('session_id', sessionId);
  } catch (e) {
    console.error("DB write error:", e);
  }
}

// --- Usage tracking -------------------------------------------------
async function incrementUsage(sessionId) {
  if (!sessionId) return;
  if (!supabase) {
    if (!db.settings[sessionId]) db.settings[sessionId] = {};
    db.settings[sessionId].message_count = (db.settings[sessionId].message_count || 0) + 1;
    db.settings[sessionId].last_active = new Date();
    return;
  }
  try {
    const { error } = await supabase.rpc('increment_usage', { p_session_id: sessionId });
    if (error) throw error;
  } catch (e) {
    console.error("incrementUsage failed:", e);
  }
}

// --- Admin: high-volume usage leaderboard ---------------------------
async function getTopUsageBots(limit = 20) {
  if (!supabase) {
    return Object.entries(db.settings)
      .map(([sid, s]) => ({
        session_id: sid,
        bot_name: s.botName,
        phone_number: s.phoneNumber,
        status: s.status,
        message_count: s.message_count || 0,
        last_active: s.last_active || null,
        is_abusive: s.is_abusive || false
      }))
      .sort((a, b) => b.message_count - a.message_count)
      .slice(0, limit);
  }
  try {
    const { data, error } = await supabase
      .from('bot_registry')
      .select('session_id, bot_name, phone_number, status, message_count, last_active, is_abusive')
      .order('message_count', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error("getTopUsageBots failed:", e);
    return [];
  }
}

// --- Admin: inactive bots -------------------------------------------
async function getInactiveBots(days = 7) {
  const cutoff = new Date(Date.now() - days * 86400000);
  const cutoffIso = cutoff.toISOString();
  if (!supabase) {
    return Object.entries(db.settings)
      .filter(([, s]) => !s.last_active || new Date(s.last_active) < cutoff)
      .map(([sid, s]) => ({
        session_id: sid,
        bot_name: s.botName,
        last_active: s.last_active || null,
        status: s.status
      }));
  }
  try {
    const { data, error } = await supabase
      .from('bot_registry')
      .select('session_id, bot_name, last_active, status')
      .or(`last_active.lt.${cutoffIso},last_active.is.null`);
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error("getInactiveBots failed:", e);
    return [];
  }
}

// --- Admin: flag / unflag a bot as abusive --------------------------
async function flagAbusive(sessionId, value = true) {
  if (!supabase) {
    if (db.settings[sessionId]) db.settings[sessionId].is_abusive = value;
    return;
  }
  try {
    await supabase
      .from('bot_registry')
      .update({ is_abusive: value })
      .eq('session_id', sessionId);
  } catch (e) {
    console.error("flagAbusive failed:", e);
  }
}

// --- Admin: check abusive flag (used by msgHandler gate) ------------
async function isBotAbusive(sessionId) {
  if (!supabase) return !!db.settings[sessionId]?.is_abusive;
  try {
    const { data, error } = await supabase
      .from('bot_registry')
      .select('is_abusive')
      .eq('session_id', sessionId)
      .single();
    if (error) throw error;
    return !!data?.is_abusive;
  } catch (e) {
    console.error("isBotAbusive failed:", e.message);
    return false;
  }
}

// --- Admin: hard-delete a bot row -----------------------------------
async function deleteBot(sessionId) {
  if (!supabase) {
    delete db.settings[sessionId];
    return;
  }
  try {
    await supabase
      .from('bot_registry')
      .delete()
      .eq('session_id', sessionId);
  } catch (e) {
    console.error("deleteBot failed:", e);
  }
}

// Mark bot as offline
async function markBotOffline(sessionId) {
  if (!supabase) {
    delete db.settings[sessionId];
    return;
  }
  try {
    await supabase
      .from('bot_registry')
      .update({ status: 'offline' })
      .eq('session_id', sessionId);
  } catch (e) {
    console.error("markBotOffline error:", e);
  }
}

// --- AI conversation memory (per bot, per user) ---------------------
async function getAiMemory(sessionId, userJid) {
  if (!supabase) {
    return db.aiMemory[`${sessionId}:${userJid}`] || { display_name: null, history: [] };
  }
  try {
    const { data, error } = await supabase
      .from('ai_memory')
      .select('display_name, history')
      .eq('session_id', sessionId)
      .eq('user_jid', userJid)
      .single();
    if (error && error.code !== 'PGRST116') throw error; // ignore "no rows found"
    return data || { display_name: null, history: [] };
  } catch (e) {
    console.error("getAiMemory failed:", e.message);
    return { display_name: null, history: [] };
  }
}

async function saveAiMemory(sessionId, userJid, displayName, history) {
  if (!supabase) {
    db.aiMemory[`${sessionId}:${userJid}`] = { display_name: displayName, history };
    return;
  }
  try {
    await supabase
      .from('ai_memory')
      .upsert({
        session_id: sessionId,
        user_jid: userJid,
        display_name: displayName,
        history,
        updated_at: new Date()
      }, { onConflict: 'session_id,user_jid' });
  } catch (e) {
    console.error("saveAiMemory failed:", e.message);
  }
}

module.exports = {
  registerBot,
  getPublicBots,
  getSettings,
  updateSettings,
  markBotOffline,
  isBotNameTaken,
  incrementUsage,
  getTopUsageBots,
  getInactiveBots,
  flagAbusive,
  isBotAbusive,
  deleteBot,
  getAiMemory,
  saveAiMemory,
  db
};
