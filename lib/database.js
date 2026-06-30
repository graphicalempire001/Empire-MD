// Empire MD - Supabase Database Layer & Multi-user Registry (Improved + Per-Bot Owner + Admin)
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
}

const db = {
    settings: {},
    afk: {}
};

// --- Duplicate-name guard -------------------------------------------
// Case-insensitive check used by /api/connect BEFORE a session is created.
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
            .ilike('bot_name', name)   // case-insensitive exact match
            .limit(1);
        if (error) throw error;
        return !!(data && data.length);
    } catch (e) {
        console.error("isBotNameTaken failed:", e);
        return false; // fail-open on lookup; the DB unique index is the hard guard
    }
}

// Register or update bot — owner defaults to the EXACT paired number,
// but an explicit ownerNumber (4th arg from server.js) takes priority.
// Returns { ok: true } on success, or { ok: false, code, error } on failure
// so callers can detect the 23505 unique-name violation cleanly.
async function registerBot(sessionId, botName, phoneNumber, ownerNumber) {
    const cleanPhone = String(phoneNumber || '').replace(/[^0-9]/g, '');
    // Prefer the explicit owner passed in; otherwise fall back to the paired number.
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
        ownerNumber: cleanOwner ? [cleanOwner] : []   // ← this bot's own owner
    };

    if (!supabase) {
        // In-memory duplicate guard mirrors the DB unique index
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
            // 23505 = unique_violation (duplicate bot_name from the unique index)
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

// Get public bots - Only show truly active ones
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
            .eq('status', 'online')           // Only show online bots
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

// Merge (not overwrite) so a partial update never wipes the saved ownerNumber.
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
        const current = await getSettings(sessionId);          // read existing row
        const merged = { ...current, ...newSettings };          // merge over it
        await supabase
            .from('bot_registry')
            .update({ settings: merged, status: 'online' })
            .eq('session_id', sessionId);
    } catch (e) {
        console.error("DB write error:", e);
    }
}

// --- Usage tracking -------------------------------------------------
// Call this from your message handler on every processed message.
async function incrementUsage(sessionId) {
    if (!sessionId) return;
    if (!supabase) {
        if (!db.settings[sessionId]) db.settings[sessionId] = {};
        db.settings[sessionId].message_count = (db.settings[sessionId].message_count || 0) + 1;
        db.settings[sessionId].last_active = new Date();
        return;
    }
    try {
        // Uses the increment_usage(p_session_id) SQL function (atomic).
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

// --- Admin: inactive bots (no activity since cutoff) ----------------
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

// Mark bot as offline when deleted/disconnected
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
    deleteBot,
    db
};
