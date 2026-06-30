// Empire MD - Supabase Database Layer & Multi-user Registry (Improved + Per-Bot Owner)
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

// Register or update bot — owner defaults to the EXACT paired number,
// but an explicit ownerNumber (4th arg from server.js) takes priority.
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
        db.settings[sessionId] = {
            botName: botName || "Empire MD",
            phoneNumber: cleanPhone,
            status: 'online',
            created_at: new Date(),
            settings: defaultSettings
        };
        console.log(`[DB] In-memory owner set: ${cleanOwner}`);
        return;
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
        } else {
            console.log(`[DB SUCCESS] Owner saved for ${sessionId} → ${cleanOwner}`);
        }
    } catch (e) {
        console.error("registerBot failed:", e);
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
    db
};
