// Empire MD - Connection Server, Pairing Engine, & Onboarding Portal
const express = require('express');
const http = require('http');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const config = require('./config');
const { handleMessage } = require('./lib/msgHandler');
const { registerBot, getPublicBots, updateSettings, getSettings } = require('./lib/database');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ CORS headers — allow frontend hosted on Vercel/Netlify to call Railway backend
app.use((req, res, next) => {
    const allowedOrigins = [
        process.env.FRONTEND_URL,
        'http://localhost:3000',
        'http://localhost:5500'
    ].filter(Boolean);
    const origin = req.headers.origin;
    if (!origin || allowedOrigins.some(o => origin.startsWith(o)) || process.env.NODE_ENV !== 'production') {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Keep track of active connection attempts in-memory
const activeSessions = {};

// Helper to generate custom session id
function generateSessionId(botName) {
    const formattedName = botName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `BOTWAN_${formattedName}_${randomSuffix}`;
}

// 🌐 API 1: Request Pairing Code (Initiate connection)
app.post('/api/connect', async (req, res) => {
    try {
        const { phoneNumber, botName } = req.body;
        if (!phoneNumber || !botName) {
            return res.status(400).json({ success: false, error: "Phone number and bot name are required!" });
        }

        // Ensure number is strictly digits for WhatsApp API
        const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
        if (cleanPhone.length < 7 || cleanPhone.length > 15) {
            return res.status(400).json({ success: false, error: "Invalid phone number. Include country code, digits only." });
        }

        const sessionId = generateSessionId(botName);
        console.log(`📡 Triggering real WhatsApp notification for: ${botName} (${cleanPhone})`);

        // Setup individual multi-file auth credentials path for this user
        const sessionFolder = path.join(__dirname, `sessions/${sessionId}`);
        const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            // ✅ CRITICAL: Browser must be in this format to trigger phone notifications
            browser: ["Ubuntu", "Chrome", "20.0.04"] 
        });

        // Store session status in memory
        activeSessions[sessionId] = {
            sock,
            botName,
            phoneNumber: cleanPhone,
            status: 'pairing',
            pairingCode: null,
            expiry: Date.now() + 60000, // ✅ Updated to 60 seconds
            saveCreds
        };

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                if (reason === DisconnectReason.loggedOut) {
                    delete activeSessions[sessionId];
                }
            } else if (connection === 'open') {
                console.log(`✅ Session ${sessionId} connected successfully!`);
                if (activeSessions[sessionId]) {
                    activeSessions[sessionId].status = 'connected';
                }

                const ownerJid = cleanPhone + '@s.whatsapp.net';
                const channelUrl = "https://whatsapp.com/channel/0029VaI3OXiF6smuq5LxxN15";

                const welcomeDm = `✨ *Welcome to ${botName}!* ✨\n\nYour bot is registered under Session ID:\n👉 *${sessionId}*\n\n_Type .help to begin!_`;

                try {
                    await sock.sendMessage(ownerJid, {
                        text: welcomeDm,
                        contextInfo: {
                            externalAdReply: {
                                title: "BOT-WAN Official Onboarding",
                                body: "Connection Successful",
                                mediaType: 1,
                                sourceUrl: channelUrl,
                                thumbnailUrl: "https://i.ibb.co/pB20mTc5/download.jpg"
                            }
                        }
                    });
                } catch (dmErr) {
                    console.error("Welcome DM failed:", dmErr.message);
                }

                try {
                    await registerBot(sessionId, botName, cleanPhone);
                } catch (dbErr) {
                    console.error("DB registration failed:", dbErr.message);
                }
            }
        });

        // ✅ THE "UNDERGROUND" TRIGGER
        // We wait 3 seconds to ensure the socket is authenticated with WA servers
        // before requesting the code that buzzes the user's phone.
        setTimeout(async () => {
            try {
                if (activeSessions[sessionId] && !sock.authState.creds.registered) {
                    const code = await sock.requestPairingCode(cleanPhone);
                    console.log(`🔑 REAL Pairing code generated: ${code}`);
                    activeSessions[sessionId].pairingCode = code;
                }
            } catch (err) {
                console.error("Pairing Trigger Error:", err.message);
                if (activeSessions[sessionId]) {
                    activeSessions[sessionId].pairingCodeError = "WhatsApp rejected the request. Try again in a moment.";
                }
            }
        }, 3000);

        return res.json({
            success: true,
            sessionId,
            expiryIn: 60 // ✅ Updated to 60 seconds for frontend
        });

    } catch (err) {
        console.error("Connect API Error:", err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// 🌐 API 2: Poll Session Pairing Status
app.get('/api/status/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const session = activeSessions[sessionId];

    if (!session) return res.json({ status: 'expired' });

    if (session.status === 'connected') {
        return res.json({ status: 'connected', sessionId });
    }

    if (Date.now() > session.expiry) {
        delete activeSessions[sessionId];
        return res.json({ status: 'expired' });
    }

    return res.json({
        status: 'pairing',
        pairingCode: session.pairingCode || null,
        pairingCodeError: session.pairingCodeError || null,
        secondsLeft: Math.max(0, Math.floor((session.expiry - Date.now()) / 1000))
    });
});

// 🌐 API 3: Web Setup Form Submission
app.post('/api/setup', async (req, res) => {
    try {
        const { sessionId, botName, ownerNumber, prefix, mode, alwaysOnline, welcome } = req.body;
        if (!sessionId) return res.status(400).json({ success: false, error: "Session ID is required!" });

        const updatedSettings = {
            botName: botName || "Empire MD",
            prefix: prefix || ".",
            mode: mode || "private",
            alwaysOnline: alwaysOnline === 'true' || alwaysOnline === true,
            welcome: welcome === 'true' || welcome === true,
            ownerNumber: ownerNumber ? ownerNumber.split(',').map(n => n.trim().replace(/[^0-9]/g, '')) : []
        };

        await updateSettings(sessionId, updatedSettings);
        return res.json({ success: true, message: "Settings saved successfully!" });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

// 🌐 API 4: Public Directory
app.get('/api/public-directory', async (req, res) => {
    try {
        const bots = await getPublicBots();
        return res.json({ success: true, bots });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

// 🌐 API 5: Health check
app.get('/api/health', (req, res) => {
    return res.json({ status: 'online', timestamp: Date.now() });
});

server.listen(PORT, () => {
    console.log(`🌐 Empire MD Server running on port ${PORT}`);
});

module.exports = { app, server };
