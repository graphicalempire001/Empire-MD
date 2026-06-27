// Empire MD - Supabase Database Layer & Multi-user Registry
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

// Auto-register a new bot session row
async function registerBot(sessionId, botName, phoneNumber) {
    if (!supabase) {
        db.settings[sessionId] = { botName, phoneNumber, status: 'online', mode: 'private', created_at: new Date() };
        return;
    }
    try {
        const { data, error } = await supabase
            .from('bot_registry')
            .upsert({
                session_id: sessionId,
                bot_name: botName,
                phone_number: phoneNumber,
                status: 'online',
                created_at: new Date(),
                settings: {
                    botName: botName,
                    prefix: '.',
                    mode: 'private',
                    alwaysOnline: true,
                    welcome: true
                }
            }, { onConflict: 'session_id' });
        
        if (error) console.error("Database registration error:", error.message);
    } catch (e) {
        console.error("registerBot failed:", e);
    }
}

// Fetch all registered bots (for public directory & admin views)
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
            .order('created_at', { ascending: false });
        if (data) return data;
    } catch (e) {
        console.error("getPublicBots failed:", e);
    }
    return [];
}

async function getSettings(sessionId) {
    if (!supabase) return db.settings[sessionId]?.settings || {};
    try {
        const { data, error } = await supabase
            .from('bot_registry')
            .select('settings')
            .eq('session_id', sessionId)
            .single();
        if (data) return data.settings;
    } catch (e) {
        console.error("DB read error:", e);
    }
    return {};
}

async function updateSettings(sessionId, newSettings) {
    if (!supabase) {
        if (!db.settings[sessionId]) db.settings[sessionId] = {};
        db.settings[sessionId].settings = { ...(db.settings[sessionId].settings || {}), ...newSettings };
        return;
    }
    try {
        const current = await getSettings(sessionId);
        const updated = { ...current, ...newSettings };
        await supabase
            .from('bot_registry')
            .update({ settings: updated, status: 'online' })
            .eq('session_id', sessionId);
    } catch (e) {
        console.error("DB write error:", e);
    }
}

module.exports = {
    registerBot,
    getPublicBots,
    getSettings,
    updateSettings,
    db
};