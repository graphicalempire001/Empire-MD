// Empire MD - Supabase Database Layer
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

async function getSettings(sessionId) {
    if (!supabase) return db.settings[sessionId] || {};
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
        db.settings[sessionId] = { ...(db.settings[sessionId] || {}), ...newSettings };
        return;
    }
    try {
        const current = await getSettings(sessionId);
        const updated = { ...current, ...newSettings };
        await supabase
            .from('bot_registry')
            .update({ settings: updated })
            .eq('session_id', sessionId);
    } catch (e) {
        console.error("DB write error:", e);
    }
}

module.exports = {
    getSettings,
    updateSettings,
    db
};