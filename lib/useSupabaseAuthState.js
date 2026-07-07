const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

// We reuse the existing Supabase client if possible, or initialize a new one.
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
}

async function useSupabaseAuthState(sessionId) {
    // Failback helper to write JSON to a local mock object if Supabase is offline/not set up
    const mockDb = {};

    const writeData = async (key, value) => {
        if (!supabase) {
            mockDb[key] = value;
            return;
        }
        try {
            const { error } = await supabase
                .from('bot_auth_states')
                .upsert({
                    session_id: sessionId,
                    key_type: key,
                    value: value,
                    updated_at: new Date()
                }, { onConflict: 'session_id,key_type' });
            if (error) throw error;
        } catch (err) {
            console.error(`[DB AUTH WRITE ERROR] Session: ${sessionId}, Key: ${key}:`, err.message);
        }
    };

    const readData = async (key) => {
        if (!supabase) {
            return mockDb[key] || null;
        }
        try {
            const { data, error } = await supabase
                .from('bot_auth_states')
                .select('value')
                .eq('session_id', sessionId)
                .eq('key_type', key)
                .maybeSingle();
            if (error) throw error;
            return data ? data.value : null;
        } catch (err) {
            console.error(`[DB AUTH READ ERROR] Session: ${sessionId}, Key: ${key}:`, err.message);
            return null;
        }
    };

    const removeData = async (key) => {
        if (!supabase) {
            delete mockDb[key];
            return;
        }
        try {
            const { error } = await supabase
                .from('bot_auth_states')
                .delete()
                .eq('session_id', sessionId)
                .eq('key_type', key);
            if (error) throw error;
        } catch (err) {
            console.error(`[DB AUTH DELETE ERROR] Session: ${sessionId}, Key: ${key}:`, err.message);
        }
    };

    // Load or initialize standard Baileys credentials
    let creds = await readData('creds');
    if (!creds) {
        // Generate clean, default Baileys credentials
        const { initWithKeys } = require('@whiskeysockets/baileys');
        const Curve = require('curve25519-js');
        
        // Use Baileys standard credentials generation method:
        const { BufferJSON } = require('@whiskeysockets/baileys');
        const { randomBytes } = require('crypto');
        
        const initCreds = () => {
            const keyPair = Curve.generateKeyPair(randomBytes(32));
            const identityKey = Curve.generateKeyPair(randomBytes(32));
            return {
                noiseKey: Curve.generateKeyPair(randomBytes(32)),
                pairingEphemeralKeyPair: Curve.generateKeyPair(randomBytes(32)),
                signedIdentityKey: identityKey,
                signedPreKey: {
                    keyPair: Curve.generateKeyPair(randomBytes(32)),
                    signature: randomBytes(64),
                    keyId: 1
                },
                registrationId: Math.floor(Math.random() * 16383) + 1,
                advSecretKey: randomBytes(32).toString('base64'),
                processedHistoryMessages: [],
                nextPreKeyId: 1,
                firstUnuploadedPreKeyId: 1,
                accountSettings: { unarchiveChats: false },
                registered: false,
                me: undefined,
                signalIdentities: [],
                lastAccountSyncTimestamp: undefined,
                myAppStateKeyId: undefined
            };
        };

        // Standard Baileys state initialization using generateRegistrationId etc
        const { L_MQ_CHANNELS, initAuthCreds } = require('@whiskeysockets/baileys');
        creds = initAuthCreds();
        await writeData('creds', JSON.parse(JSON.stringify(creds, (_, val) => {
            if (Buffer.isBuffer(val)) return val.toString('base64');
            return val;
        })));
    }

    // Helper functions to parse Buffer data encoded during transport
    const fixBufferEncoding = (data) => {
        if (!data) return data;
        return JSON.parse(JSON.stringify(data), (key, value) => {
            if (value && typeof value === 'object' && value.type === 'Buffer' && Array.isArray(value.data)) {
                return Buffer.from(value.data);
            }
            if (value && typeof value === 'object' && value.buffer === true && typeof value.data === 'string') {
                return Buffer.from(value.data, 'base64');
            }
            return value;
        });
    };

    const state = {
        creds: fixBufferEncoding(creds),
        keys: {
            get: async (type, ids) => {
                const results = {};
                await Promise.all(ids.map(async (id) => {
                    const dbKey = `${type}:${id}`;
                    let val = await readData(dbKey);
                    if (val) {
                        results[id] = fixBufferEncoding(val);
                    }
                }));
                return results;
            },
            set: async (data) => {
                const tasks = [];
                for (const type in data) {
                    for (const id in data[type]) {
                        const val = data[type][id];
                        const dbKey = `${type}:${id}`;
                        if (val) {
                            tasks.push(writeData(dbKey, JSON.parse(JSON.stringify(val, (_, v) => {
                                if (Buffer.isBuffer(v)) return { buffer: true, data: v.toString('base64') };
                                return v;
                            }))));
                        } else {
                            tasks.push(removeData(dbKey));
                        }
                    }
                }
                await Promise.all(tasks);
            }
        }
    };

    const saveCreds = async () => {
        // Serialize credentials carefully, converting Buffers to base64 so PostgreSQL can store them as raw JSONB
        const serialized = JSON.parse(JSON.stringify(state.creds, (_, val) => {
            if (Buffer.isBuffer(val)) {
                return { buffer: true, data: val.toString('base64') };
            }
            return val;
        }));
        await writeData('creds', serialized);
    };

    return {
        state,
        saveCreds
    };
}

module.exports = { useSupabaseAuthState };
