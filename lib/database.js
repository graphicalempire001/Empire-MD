// Empire MD - Supabase Database Layer & Multi-user Registry (Improved)
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

// Register or update bot - Use EXACT paired number as owner
async function registerBot(sessionId, botName, phoneNumber) {
    const cleanPhone = String(phoneNumber || '').replace(/[^0-9]/g, '');
    
    if (!cleanPhone) {
        console.error(`[DB] No phone number provided for session ${sessionId}`);
    }

    const defaultSettings = {
        botName: botName || "Empire MD",
        prefix: '.',
        mode: 'private',
        alwaysOnline: true,
        welcome: true,
        ownerNumber: cleanPhone ? [cleanPhone] : []   // ← ONLY the real paired number
    };

    if (!supabase) {
        db.settings[sessionId] = {
            botName: botName || "Empire MD",
            phoneNumber: cleanPhone,
            status: 'online',
            created_at: new Date(),
            settings: defaultSettings
        };
        console.log(`[DB] In-memory owner set: ${cleanPhone}`);
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
            console.log(`[DB SUCCESS] Owner saved for ${sessionId} → ${cleanPhone}`);
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
        return data?.settings || {};
    } catch (e) {
        console.error("DB read error:", e);
        return {};
    }
}

async function updateSettings(sessionId, newSettings) {
    if (!supabase) {
        if (!db.settings[sessionId]) db.settings[sessionId] = {};
        db.settings[sessionId].settings = { ...(db.settings[sessionId].settings || {}), ...newSettings };
        return;
    }
    try {
        await supabase
            .from('bot_registry')
            .update({ settings: newSettings, status: 'online' })
            .eq('session_id', sessionId);
    } catch (e) {
        console.error("DB write error:", e);
    }
}

// Optional: Function to mark bot as offline when deleted
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
