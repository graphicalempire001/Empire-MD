// Empire MD - Supabase Database Layer & Multi-user Registry (Improved + Per-Bot Owner + Admin + AI Memory)
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
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
// NOTE: `plan` argument is NOT trusted as ground truth — it's only a fallback hint.
// Real premium status is always resolved from the `subscribers` table by phone number,
// so a client can never grant itself Premium by sending plan:'premium' in a pairing request.
async function registerBot(sessionId, botName, phoneNumber, ownerNumber, plan = 'free') {
  const cleanPhone = String(phoneNumber || '').replace(/[^0-9]/g, '');
  const cleanOwner = String(ownerNumber || phoneNumber || '').replace(/[^0-9]/g, '');
  if (!cleanOwner) {
    console.error(`[DB] No owner/phone number provided for session ${sessionId}`);
  }

  const subscriber = await getSubscriber(cleanOwner);
  const chosenPlan = effectivePlanFromSubscriber(subscriber);
  const planExpiresAt = subscriber?.plan_expires_at || null;
  const isWhitelisted = !!subscriber?.is_whitelisted;

  const defaultSettings = {
    botName: botName || "Empire MD",
    prefix: '.',
    mode: 'private',
    alwaysOnline: true,
    welcome: true,
    ownerNumber: cleanOwner ? [cleanOwner] : [],
    plan: chosenPlan,
    plan_expires_at: planExpiresAt,
    is_whitelisted: isWhitelisted,
    ghostMode: false
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
      command_count: db.settings[sessionId]?.command_count || 0,
      last_active: new Date(),
      is_abusive: false,
      plan: chosenPlan,
      plan_expires_at: planExpiresAt,
      is_whitelisted: isWhitelisted,
      settings: defaultSettings
    };
    console.log(`[DB] In-memory owner set: ${cleanOwner} | plan: ${chosenPlan}`);
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
        plan: chosenPlan,
        plan_expires_at: planExpiresAt,
        is_whitelisted: isWhitelisted,
        last_active: new Date().toISOString(),
        settings: defaultSettings
      }, { onConflict: 'session_id' });
    if (error) {
      console.error("Database registration error:", error.message);
      if (error.code === '23505') {
        return { ok: false, code: '23505', error: 'Bot name already taken.' };
      }
      return { ok: false, code: error.code, error: error.message };
    }
    console.log(`[DB SUCCESS] Owner saved for ${sessionId} → ${cleanOwner} | plan: ${chosenPlan}`);
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

// 📈 Track Command Usage
async function incrementCommandCount(sessionId) {
  if (!sessionId) return;
  if (!supabase) {
    if (!db.settings[sessionId]) db.settings[sessionId] = {};
    db.settings[sessionId].command_count = (db.settings[sessionId].command_count || 0) + 1;
    return;
  }
  try {
    const { error } = await supabase.rpc('increment_command_count', { p_session_id: sessionId });
    if (error) {
      // Fallback if RPC is not defined: direct update
      await supabase
        .from('bot_registry')
        .update({ command_count: supabase.sql`command_count + 1` })
        .eq('session_id', sessionId);
    }
  } catch (e) {
    console.error("incrementCommandCount failed:", e.message);
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
        command_count: s.command_count || 0,
        last_active: s.last_active || null,
        is_abusive: s.is_abusive || false
      }))
      .sort((a, b) => b.message_count - a.message_count)
      .slice(0, limit);
  }
  try {
    const { data, error } = await supabase
      .from('bot_registry')
      .select('session_id, bot_name, phone_number, status, message_count, command_count, last_active, is_abusive')
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

// Admin: Get ALL bots (paginated — no 200/1000 silent cap)
async function getAllBots() {
  if (!supabase) {
    return Object.entries(db.settings).map(([sid, s]) => ({
      session_id: sid,
      bot_name: s.botName || 'Empire Bot',
      phone_number: s.phoneNumber || '',
      status: s.status || 'offline',
      created_at: s.created_at || null,
      last_active: s.last_active || null,
      message_count: s.message_count || 0,
      command_count: s.command_count || 0,
      is_abusive: !!s.is_abusive
    })).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }

  const pageSize = 1000;
  let from = 0;
  const all = [];
  for (;;) {
    const { data, error } = await supabase
      .from('bot_registry')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = data || [];
    all.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

/** Bots paired/created within [fromDate, toDate] inclusive (ISO date strings YYYY-MM-DD). */
async function getBotsByDateRange(fromDate, toDate, { connectedOnly = false } = {}) {
  const bots = await getAllBots();
  const from = fromDate ? new Date(fromDate + 'T00:00:00.000Z') : null;
  const to = toDate ? new Date(toDate + 'T23:59:59.999Z') : null;

  return bots.filter((b) => {
    const phone = String(b.phone_number || '').replace(/\D/g, '');
    if (!phone || phone.length < 8) return false;
    if (connectedOnly && String(b.status || '').toLowerCase() !== 'online') return false;
    const created = b.created_at ? new Date(b.created_at) : null;
    if (!created || isNaN(created.getTime())) return false;
    if (from && created < from) return false;
    if (to && created > to) return false;
    return true;
  });
}

/** Build a VCF string for a list of bot rows. */
function buildBotsVcf(bots) {
  const lines = [];
  for (const b of bots || []) {
    let phone = String(b.phone_number || '').replace(/\D/g, '');
    if (!phone) continue;
    if (!phone.startsWith('+')) {
      // store as +E.164 style in VCF when possible
      phone = '+' + phone;
    }
    const rawName = String(b.bot_name || 'Bot').replace(/[\r\n;]/g, ' ').trim();
    const fn = `Empire Bot – ${rawName}`;
    lines.push('BEGIN:VCARD');
    lines.push('VERSION:3.0');
    lines.push(`FN:${fn}`);
    lines.push(`N:;${fn};;;`);
    lines.push(`TEL;TYPE=CELL:${phone}`);
    lines.push(`NOTE:session_id=${b.session_id || ''}`);
    lines.push('END:VCARD');
  }
  return lines.join('\r\n') + (lines.length ? '\r\n' : '');
}

/** Set registry status online|offline (inactive = offline). Removes from public landing when offline. */
async function setBotStatus(sessionId, status) {
  const st = status === 'online' || status === 'active' ? 'online' : 'offline';
  if (!supabase) {
    if (db.settings[sessionId]) db.settings[sessionId].status = st;
    return st;
  }
  const { error } = await supabase
    .from('bot_registry')
    .update({ status: st })
    .eq('session_id', sessionId);
  if (error) throw error;
  return st;
}

/** Delete many bots from DB (session files killed by server). */
async function deleteBots(sessionIds) {
  const ids = (sessionIds || []).filter(Boolean);
  for (const id of ids) {
    await deleteBot(id);
  }
  return ids.length;
}


// ─────────────────────────────────────────────────────────────
// PREMIUM / PLAN HELPERS
// ─────────────────────────────────────────────────────────────

async function getBotRegistry(sessionId) {
  if (!sessionId) return null;
  if (!supabase) {
    const row = db.settings[sessionId];
    if (!row) return null;
    return {
      session_id: sessionId,
      plan: row.plan || 'free',
      plan_expires_at: row.plan_expires_at || null,
      is_whitelisted: !!row.is_whitelisted,
      whitelist_reason: row.whitelist_reason || null,
      last_active: row.last_active || null,
      phone_number: row.phoneNumber || null,
      bot_name: row.botName || null,
      status: row.status || 'offline',
      settings: row.settings || {}
    };
  }
  try {
    const { data, error } = await supabase
      .from('bot_registry')
      .select('*')
      .eq('session_id', sessionId)
      .single();
    if (error) throw error;
    return data;
  } catch (e) {
    console.error('getBotRegistry failed:', e.message);
    return null;
  }
}

/**
 * Look up bot(s) by the phone number they were paired with. Used by the
 * checkout flow, since a paying customer knows their WhatsApp number, not
 * their internal session_id. Returns the most recently active match.
 * @param {string} phoneNumber - digits only
 */
async function getBotByPhone(phoneNumber) {
  const clean = String(phoneNumber || '').replace(/[^0-9]/g, '');
  if (!clean) return null;
  if (!supabase) {
    for (const [sessionId, row] of Object.entries(db.settings)) {
      if (row.phoneNumber === clean) {
        return { session_id: sessionId, ...row };
      }
    }
    return null;
  }
  try {
    const { data, error } = await supabase
      .from('bot_registry')
      .select('*')
      .eq('phone_number', clean)
      .order('last_active', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  } catch (e) {
    console.error('getBotByPhone failed:', e.message);
    return null;
  }
}

async function setPlan(sessionId, plan, expiresAt = null, paymentRef = null) {
  const payload = {
    plan: plan === 'premium' ? 'premium' : 'free',
    plan_expires_at: expiresAt,
    payment_ref: paymentRef || null
  };

  if (!supabase) {
    if (!db.settings[sessionId]) db.settings[sessionId] = {};
    Object.assign(db.settings[sessionId], payload);
    if (!db.settings[sessionId].settings) db.settings[sessionId].settings = {};
    db.settings[sessionId].settings.plan = payload.plan;
    db.settings[sessionId].settings.plan_expires_at = payload.plan_expires_at;
    return true;
  }

  try {
    const { error } = await supabase
      .from('bot_registry')
      .update(payload)
      .eq('session_id', sessionId);
    if (error) throw error;

    const current = await getSettings(sessionId);
    await updateSettings(sessionId, {
      ...current,
      plan: payload.plan,
      plan_expires_at: payload.plan_expires_at
    });
    return true;
  } catch (e) {
    console.error('setPlan failed:', e.message);
    return false;
  }
}

async function setWhitelist(sessionId, enabled = true, reason = 'admin') {
  if (!supabase) {
    if (!db.settings[sessionId]) db.settings[sessionId] = {};
    db.settings[sessionId].is_whitelisted = !!enabled;
    db.settings[sessionId].whitelist_reason = reason;
    if (!db.settings[sessionId].settings) db.settings[sessionId].settings = {};
    db.settings[sessionId].settings.is_whitelisted = !!enabled;
    return true;
  }
  try {
    await supabase
      .from('bot_registry')
      .update({
        is_whitelisted: !!enabled,
        whitelist_reason: reason
      })
      .eq('session_id', sessionId);

    const current = await getSettings(sessionId);
    await updateSettings(sessionId, {
      ...current,
      is_whitelisted: !!enabled
    });
    return true;
  } catch (e) {
    console.error('setWhitelist failed:', e.message);
    return false;
  }
}

// --- Phone-anchored subscriptions (survive reconnect / session_id change) ---

/** Look up a subscriber's real plan by phone number. Returns effective plan info. */
async function getSubscriber(phoneNumber) {
  const cleanPhone = String(phoneNumber || '').replace(/[^0-9]/g, '');
  if (!cleanPhone) return { plan: 'free', plan_expires_at: null, is_whitelisted: false };
  if (!supabase) {
    return db.subscribers?.[cleanPhone] || { plan: 'free', plan_expires_at: null, is_whitelisted: false };
  }
  try {
    const { data, error } = await supabase
      .from('subscribers')
      .select('plan, plan_expires_at, is_whitelisted, whitelist_reason, last_payment_ref')
      .eq('phone_number', cleanPhone)
      .maybeSingle();
    if (error) throw error;
    return data || { plan: 'free', plan_expires_at: null, is_whitelisted: false };
  } catch (e) {
    console.error('getSubscriber failed:', e.message);
    return { plan: 'free', plan_expires_at: null, is_whitelisted: false };
  }
}

/** True effective plan right now — whitelisted OR unexpired premium. */
function effectivePlanFromSubscriber(sub) {
  if (!sub) return 'free';
  if (sub.is_whitelisted) return 'premium';
  if (sub.plan === 'premium' && sub.plan_expires_at && new Date(sub.plan_expires_at) > new Date()) return 'premium';
  return 'free';
}

/** Activate/extend premium for a phone number (accrues on remaining time). Used by payment webhook + admin. */
async function activatePremiumByPhone(phoneNumber, days = 30, paymentRef = null) {
  const cleanPhone = String(phoneNumber || '').replace(/[^0-9]/g, '');
  if (!cleanPhone) return { ok: false, error: 'phone required' };
  if (!supabase) {
    if (!db.subscribers) db.subscribers = {};
    const prev = db.subscribers[cleanPhone];
    const base = prev?.plan === 'premium' && prev.plan_expires_at && new Date(prev.plan_expires_at) > new Date()
      ? new Date(prev.plan_expires_at) : new Date();
    const expires = new Date(base.getTime() + days * 864e5);
    db.subscribers[cleanPhone] = { plan: 'premium', plan_expires_at: expires.toISOString(), last_payment_ref: paymentRef, is_whitelisted: prev?.is_whitelisted || false };
    return { ok: true, phone_number: cleanPhone, plan: 'premium', expires_at: expires.toISOString() };
  }
  try {
    const { data, error } = await supabase.rpc('activate_premium_by_phone', {
      p_phone: cleanPhone, p_days: days, p_payment_ref: paymentRef,
    });
    if (error) throw error;
    return data;
  } catch (e) {
    console.error('activatePremiumByPhone failed:', e.message);
    return { ok: false, error: e.message };
  }
}

/** Admin manual whitelist by phone number — grants premium with no expiry until removed. */
async function setSubscriberWhitelist(phoneNumber, enabled = true, reason = 'admin') {
  const cleanPhone = String(phoneNumber || '').replace(/[^0-9]/g, '');
  if (!cleanPhone) return { ok: false, error: 'phone required' };
  if (!supabase) {
    if (!db.subscribers) db.subscribers = {};
    db.subscribers[cleanPhone] = { ...(db.subscribers[cleanPhone] || { plan: 'free', plan_expires_at: null }), is_whitelisted: !!enabled, whitelist_reason: enabled ? reason : null };
    return { ok: true, phone_number: cleanPhone, whitelisted: !!enabled };
  }
  try {
    const { data, error } = await supabase.rpc('set_whitelist_by_phone', {
      p_phone: cleanPhone, p_enabled: !!enabled, p_reason: reason,
    });
    if (error) throw error;
    return data;
  } catch (e) {
    console.error('setSubscriberWhitelist failed:', e.message);
    return { ok: false, error: e.message };
  }
}

/** Admin: search subscribers by phone number substring (for manual whitelist search). */
async function searchSubscribers(query, limit = 30) {
  const q = String(query || '').replace(/[^0-9]/g, '');
  if (!supabase) {
    const all = Object.entries(db.subscribers || {}).map(([phone_number, s]) => ({ phone_number, ...s }));
    return q ? all.filter((s) => s.phone_number.includes(q)) : all;
  }
  try {
    let sel = supabase.from('subscribers').select('*').order('updated_at', { ascending: false }).limit(limit);
    if (q) sel = sel.ilike('phone_number', `%${q}%`);
    const { data, error } = await sel;
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('searchSubscribers failed:', e.message);
    return [];
  }
}

/** Admin: list payment records, most recent first. */
async function listPayments({ limit = 100, status = null } = {}) {
  if (!supabase) return [];
  try {
    let sel = supabase.from('payments').select('*').order('created_at', { ascending: false }).limit(limit);
    if (status) sel = sel.eq('status', status);
    const { data, error } = await sel;
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('listPayments failed:', e.message);
    return [];
  }
}

async function touchLastActive(sessionId) {
  if (!sessionId) return;
  const now = new Date().toISOString();
  if (!supabase) {
    if (db.settings[sessionId]) db.settings[sessionId].last_active = now;
    return;
  }
  try {
    await supabase
      .from('bot_registry')
      .update({ last_active: now })
      .eq('session_id', sessionId);
  } catch (e) {}
}

async function getInactiveSessions(days = 3) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  if (!supabase) {
    return Object.entries(db.settings)
      .filter(([, s]) => !s.last_active || new Date(s.last_active) < new Date(cutoff))
      .map(([sid, s]) => ({
        session_id: sid,
        bot_name: s.botName,
        last_active: s.last_active,
        status: s.status
      }));
  }
  try {
    const { data, error } = await supabase
      .from('bot_registry')
      .select('session_id, bot_name, last_active, status, plan')
      .or(`last_active.lt.${cutoff},last_active.is.null`);
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('getInactiveSessions failed:', e.message);
    return [];
  }
}

async function recordPayment({ sessionId, phone, amount, currency = 'NGN', provider, reference, status = 'pending' }) {
  if (!supabase) {
    console.log('[PAY] (memory) recorded', reference, status);
    return true;
  }
  try {
    await supabase.from('payments').upsert({
      session_id: sessionId,
      phone_number: phone,
      amount,
      currency,
      provider,
      reference,
      status,
      paid_at: status === 'success' ? new Date().toISOString() : null
    }, { onConflict: 'reference' });
    return true;
  } catch (e) {
    console.error('recordPayment failed:', e.message);
    return false;
  }
}

async function getBotByName(botName) {
  const name = String(botName || '').trim().toLowerCase();
  if (!name) return null;
  if (!supabase) {
    const entry = Object.entries(db.settings).find(
      ([, s]) => String(s.botName || '').trim().toLowerCase() === name
    );
    if (!entry) return null;
    const [sessionId, s] = entry;
    return { session_id: sessionId, bot_name: s.botName, phone_number: s.phoneNumber, plan: s.plan, is_whitelisted: !!s.is_whitelisted };
  }
  try {
    const { data, error } = await supabase
      .from('bot_registry')
      .select('session_id, bot_name, phone_number, plan, plan_expires_at, is_whitelisted')
      .ilike('bot_name', name)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  } catch (e) {
    console.error('getBotByName failed:', e.message);
    return null;
  }
}

// --- Free-tier daily command quota -----------------------------------
async function checkAndIncrementQuota(sessionId, limit = 20) {
  if (!supabase) {
    if (!db.quota) db.quota = {};
    const today = new Date().toISOString().slice(0, 10);
    const row = db.quota[sessionId];
    if (!row || row.date !== today) {
      db.quota[sessionId] = { date: today, count: 1 };
      return { allowed: true, remaining: limit - 1 };
    }
    if (row.count >= limit) return { allowed: false, remaining: 0 };
    row.count += 1;
    return { allowed: true, remaining: limit - row.count };
  }
  try {
    const { data, error } = await supabase.rpc('increment_quota', { p_session_id: sessionId, p_limit: limit });
    if (error) throw error;
    return data || { allowed: true, remaining: limit };
  } catch (e) {
    console.error('checkAndIncrementQuota failed:', e.message);
    return { allowed: true, remaining: limit }; // fail open — never block a user due to a DB hiccup
  }
}

// --- Message log (dashboard message reader) ---------------------------
async function logMessage({ sessionId, chatJid, senderJid, senderName, fromMe, msgType, body }) {
  if (!supabase || !sessionId || !chatJid) return;
  try {
    await supabase.from('messages').insert({
      session_id: sessionId,
      chat_jid: chatJid,
      sender_jid: senderJid || null,
      sender_name: senderName || null,
      from_me: !!fromMe,
      msg_type: msgType || 'text',
      body: body ? String(body).slice(0, 4000) : null,
    });
  } catch (e) {
    // Never let logging break message handling
    console.error('logMessage failed:', e.message);
  }
}

/** Distinct chats for a session, most recently active first, with a preview. */
async function listChats(sessionId, limit = 100) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('chat_jid, sender_name, body, from_me, msg_type, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(2000);
    if (error) throw error;
    const seen = new Map();
    for (const m of data || []) {
      if (!seen.has(m.chat_jid)) seen.set(m.chat_jid, m);
      if (seen.size >= limit) break;
    }
    return Array.from(seen.entries()).map(([chat_jid, last]) => ({ chat_jid, last }));
  } catch (e) {
    console.error('listChats failed:', e.message);
    return [];
  }
}

/** Messages within one chat, oldest first, for a reading view. */
async function listMessages(sessionId, chatJid, limit = 200) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .eq('chat_jid', chatJid)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).reverse();
  } catch (e) {
    console.error('listMessages failed:', e.message);
    return [];
  }
}

// --- OTP (dashboard password reset via WhatsApp DM) --------------------
function hashSecret(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

function generateOtp() {
  return String(crypto.randomInt(100000, 999999));
}

async function createOtp(sessionId, phoneNumber, purpose = 'dashboard_reset') {
  const code = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min
  if (!supabase) {
    if (!db.otp) db.otp = {};
    db.otp[sessionId] = { code_hash: hashSecret(code), purpose, expires_at: expiresAt, used_at: null };
    return { code, expiresAt };
  }
  try {
    await supabase.from('otp_codes').insert({
      session_id: sessionId,
      phone_number: phoneNumber,
      code_hash: hashSecret(code),
      purpose,
      expires_at: expiresAt,
    });
    return { code, expiresAt };
  } catch (e) {
    console.error('createOtp failed:', e.message);
    return null;
  }
}

async function verifyOtp(sessionId, code, purpose = 'dashboard_reset') {
  if (!supabase) {
    const row = db.otp?.[sessionId];
    if (!row || row.purpose !== purpose || row.used_at) return false;
    if (new Date(row.expires_at) < new Date()) return false;
    if (row.code_hash !== hashSecret(code)) return false;
    row.used_at = new Date().toISOString();
    return true;
  }
  try {
    const { data, error } = await supabase
      .from('otp_codes')
      .select('*')
      .eq('session_id', sessionId)
      .eq('purpose', purpose)
      .is('used_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return false;
    if (new Date(data.expires_at) < new Date()) return false;
    if (data.code_hash !== hashSecret(code)) return false;
    await supabase.from('otp_codes').update({ used_at: new Date().toISOString() }).eq('id', data.id);
    return true;
  } catch (e) {
    console.error('verifyOtp failed:', e.message);
    return false;
  }
}

// --- Dashboard auth (username = bot_name, password = session_id by
// default, resettable via WhatsApp OTP) ---------------------------------
async function setDashboardPassword(sessionId, plainPassword) {
  const hash = hashSecret(plainPassword);
  if (!supabase) {
    if (db.settings[sessionId]) {
      db.settings[sessionId].dashboard_password_hash = hash;
      db.settings[sessionId].dashboard_password_set_at = new Date().toISOString();
    }
    return true;
  }
  try {
    await supabase
      .from('bot_registry')
      .update({ dashboard_password_hash: hash, dashboard_password_set_at: new Date().toISOString() })
      .eq('session_id', sessionId);
    return true;
  } catch (e) {
    console.error('setDashboardPassword failed:', e.message);
    return false;
  }
}

/** Find a bot by dashboard username (bot_name, case-insensitive) and verify password. */
async function verifyDashboardLogin(botName, plainPassword) {
  const name = String(botName || '').trim().toLowerCase();
  if (!name) return null;
  const hash = hashSecret(plainPassword);
  if (!supabase) {
    const entry = Object.entries(db.settings).find(
      ([, s]) => String(s.botName || '').trim().toLowerCase() === name
    );
    if (!entry) return null;
    const [sessionId, s] = entry;
    const effectiveHash = s.dashboard_password_hash || hashSecret(sessionId);
    if (effectiveHash !== hash) return null;
    if (!(s.plan === 'premium' || s.is_whitelisted)) return null;
    return { session_id: sessionId, bot_name: s.botName, phone_number: s.phoneNumber };
  }
  try {
    const { data, error } = await supabase
      .from('bot_registry')
      .select('session_id, bot_name, phone_number, plan, plan_expires_at, is_whitelisted, dashboard_password_hash')
      .ilike('bot_name', name)
      .maybeSingle();
    if (error || !data) return null;
    // Default password is the session_id itself until the user sets a custom one.
    const effectiveHash = data.dashboard_password_hash || hashSecret(data.session_id);
    if (effectiveHash !== hash) return null;
    const premium = data.is_whitelisted || (data.plan === 'premium' && data.plan_expires_at && new Date(data.plan_expires_at) > new Date());
    if (!premium) return null;
    return data;
  } catch (e) {
    console.error('verifyDashboardLogin failed:', e.message);
    return null;
  }
}

async function createDashboardSession(sessionId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 864e5).toISOString(); // 7 days
  if (!supabase) {
    if (!db.dashboardSessions) db.dashboardSessions = {};
    db.dashboardSessions[token] = { session_id: sessionId, expires_at: expiresAt };
    return token;
  }
  try {
    await supabase.from('dashboard_sessions').insert({ token, session_id: sessionId, expires_at: expiresAt });
    return token;
  } catch (e) {
    console.error('createDashboardSession failed:', e.message);
    return null;
  }
}

async function getDashboardSession(token) {
  if (!token) return null;
  if (!supabase) {
    const row = db.dashboardSessions?.[token];
    if (!row || new Date(row.expires_at) < new Date()) return null;
    return row;
  }
  try {
    const { data, error } = await supabase
      .from('dashboard_sessions')
      .select('*')
      .eq('token', token)
      .maybeSingle();
    if (error || !data) return null;
    if (new Date(data.expires_at) < new Date()) return null;
    return data;
  } catch (e) {
    console.error('getDashboardSession failed:', e.message);
    return null;
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
  incrementCommandCount,
  getTopUsageBots,
  getInactiveBots,
  flagAbusive,
  isBotAbusive,
  deleteBot,
  deleteBots,
  getAiMemory,
  getAllBots,
  getBotsByDateRange,
  buildBotsVcf,
  setBotStatus,
  saveAiMemory,
  // Premium
  getBotRegistry,
  getBotByPhone,
  setPlan,
  setWhitelist,
  touchLastActive,
  // Phone-anchored subscriptions
  getSubscriber,
  effectivePlanFromSubscriber,
  activatePremiumByPhone,
  setSubscriberWhitelist,
  searchSubscribers,
  listPayments,
  getBotByName,
  // Quota
  checkAndIncrementQuota,
  // Messages (dashboard reader)
  logMessage,
  listChats,
  listMessages,
  // OTP + dashboard auth
  createOtp,
  verifyOtp,
  setDashboardPassword,
  verifyDashboardLogin,
  createDashboardSession,
  getDashboardSession,
  getInactiveSessions,
  recordPayment,
  db
};


