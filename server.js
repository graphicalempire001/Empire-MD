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

        const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
        const sessionId = generateSessionId(botName);

        console.log(`📡 Starting connection pairing for: ${botName} (${cleanPhone}) with Session ID: ${sessionId}`);

        // Setup individual multi-file auth credentials path for this user
        const sessionFolder = path.join(__dirname, `sessions/${sessionId}`);
        const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            browser: ["BOT-WAN", "Chrome", "1.0.0"]
        });

        // Store session status in memory
        activeSessions[sessionId] = {
            sock,
            botName,
            phoneNumber: cleanPhone,
            status: 'pairing',
            pairingCode: null,
            expiry: Date.now() + 120000, // 2 minutes expiry
            saveCreds
        };

        // Listen for credentials update
        sock.ev.on('creds.update', saveCreds);

        // Listen for connection changes
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                console.log(`🔌 Connection closed for session ${sessionId}. Reason code: ${reason}`);
                if (reason === DisconnectReason.loggedOut) {
                    delete activeSessions[sessionId];
                } else {
                    // Try to reconnect if not logged out
                    console.log(`🔄 Reconnecting session ${sessionId}...`);
                }
            } else if (connection === 'open') {
                console.log(`✅ Session ${sessionId} connected successfully!`);
                activeSessions[sessionId].status = 'connected';

                // Send beautiful welcome message on successful connection to the personal DM
                const ownerJid = cleanPhone + '@s.whatsapp.net';
                const channelUrl = "https://whatsapp.com/channel/0029VaI3OXiF6smuq5LxxN15";
                
                const welcomeDm = `✨ *Welcome to ${botName}!* ✨

Your advanced Empire WhatsApp bot has been successfully connected and registered under Session ID: 
👉 *${sessionId}*

🔮 *The Future is Now!*
Experience lightning-fast keyless downloads, high-speed stickers, automatic group follow button redirects, and interactive moderation.

━━━━━━━━━━━━━━━━━━━━
📢 *JOIN OUR OFFICIAL CHANNEL*
Stay up to date with updates, developer tips, and new features by tapping the button link below:
👉 ${channelUrl}
━━━━━━━━━━━━━━━━━━━━

_Type .help in any chat to view your premium suite of commands!_`;

                // Send DM
                try {
                    await sock.sendMessage(ownerJid, {
                        text: welcomeDm,
                        contextInfo: {
                            externalAdReply: {
                                title: "BOT-WAN Official Onboarding",
                                body: "The future of WhatsApp automation is now.",
                                mediaType: 1,
                                sourceUrl: channelUrl,
                                thumbnailUrl: "https://tab-sg-1300456063.cos.ap-singapore.myqcloud.com/tab/eb2a251f-aaa4-441a-9e1d-11a07670c8b1/image/64c085c7dcfc46709979cf5eb2bcd7f4.jpg"
                            }
                        }
                    });
                } catch (dmErr) {
                    console.error("Failed to send welcome DM:", dmErr.message);
                }

                // Register bot session to Supabase database
                await registerBot(sessionId, botName, cleanPhone);
            }
        });

        // Request pairing code from Baileys
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(cleanPhone);
                if (activeSessions[sessionId]) {
                    activeSessions[sessionId].pairingCode = code;
                }
            } catch (err) {
                console.error("Error requesting pairing code:", err);
            }
        }, 3000);

        // Return initial info to client
        return res.json({
            success: true,
            sessionId,
            expiryIn: 120 // 120 seconds countdown
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
    
    if (!session) {
        return res.json({ status: 'expired' });
    }

    if (session.status === 'connected') {
        return res.json({ status: 'connected', sessionId });
    }

    if (Date.now() > session.expiry) {
        delete activeSessions[sessionId];
        return res.json({ status: 'expired' });
    }

    return res.json({
        status: 'pairing',
        pairingCode: session.pairingCode,
        secondsLeft: Math.max(0, Math.floor((session.expiry - Date.now()) / 1000))
    });
});

// 🌐 API 3: Web Setup Form Submission (Dynamic Modern ENV configuration form)
app.post('/api/setup', async (req, res) => {
    try {
        const { sessionId, botName, ownerNumber, prefix, mode, alwaysOnline, welcome } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({ success: false, error: "Session ID is required!" });
        }

        // Prepare updated settings payload
        const updatedSettings = {
            botName: botName || "Empire MD",
            prefix: prefix || ".",
            mode: mode || "private", // Always toggleable but defaults securely
            alwaysOnline: alwaysOnline === 'true' || alwaysOnline === true,
            welcome: welcome === 'true' || welcome === true,
            ownerNumber: ownerNumber ? ownerNumber.split(',').map(n => n.trim().replace(/[^0-9]/g, '')) : []
        };

        // Persist to database (Supabase)
        await updateSettings(sessionId, updatedSettings);

        console.log(`⚙️ Dynamic settings saved for session ${sessionId}:`, updatedSettings);
        return res.json({ success: true, message: "Configuration successfully registered to your cloud bot row!" });
    } catch (err) {
        console.error("Setup API Error:", err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// 🌐 API 4: Get Live Registered Bots List (Public status directory)
app.get('/api/public-directory', async (req, res) => {
    try {
        const bots = await getPublicBots();
        return res.json({ success: true, bots });
    } catch (err) {
        console.error("Public directory error:", err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// Start Onboarding Express Server
server.listen(PORT, () => {
    console.log(`🌐 Empire MD Web Onboarding Portal running on port ${PORT}`);
});

module.exports = {
    app,
    server
};