// Empire MD - Connection Server & Onboarding Web Portal
const express = require('express');
const http = require('http');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const config = require('./config');
const { handleMessage } = require('./lib/msgHandler');
const { updateSettings, getSettings } = require('./lib/database');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Web Onboarding API to Save Configuration & Toggle Bot Mode (Private/Public)
app.post('/api/setup', async (req, res) => {
    try {
        const { botName, ownerNumber, prefix, mode, alwaysOnline, welcome, channelUrl } = req.body;
        
        // Update global configuration
        if (botName) config.botName = botName;
        if (prefix) config.prefix = prefix;
        if (mode) config.mode = mode; // "private" or "public" option during user onboarding!
        if (channelUrl) config.channelUrl = channelUrl;
        
        if (ownerNumber) {
            config.ownerNumber = ownerNumber.split(',').map(n => n.trim().replace(/[^0-9]/g, ''));
        }

        config.settings.alwaysOnline = alwaysOnline === 'true' || alwaysOnline === true;
        config.settings.welcome = welcome === 'true' || welcome === true;

        console.log("⚙️ Web Onboarding Configured:", config);
        return res.json({ success: true, message: "Configuration saved successfully!" });
    } catch (err) {
        console.error("Setup API Error:", err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// Initialize WhatsApp Bot with Baileys
async function initializeWhatsAppBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session_auth');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }),
        browser: [config.botName, "Chrome", "1.0.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log("👉 Scan this QR code to connect your WhatsApp bot:");
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(`🔌 Connection closed due to:`, lastDisconnect?.error, `, reconnecting: ${shouldReconnect}`);
            if (shouldReconnect) {
                initializeWhatsAppBot();
            }
        } else if (connection === 'open') {
            console.log(`✅ ${config.botName} successfully connected to WhatsApp!`);
            
            // Welcome Onboarding Message to the owner on connection
            const ownerJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            const followChannelUrl = config.channelUrl || "https://whatsapp.com/channel/0029VajW7P829759S4vJkM3e";
            
            const onboardingWelcome = `✨ *Welcome to ${config.botName} Onboarding!* ✨

Your WhatsApp bot has been successfully deployed and linked!

🔒 *Bot Mode:* *${config.mode.toUpperCase()}* (Your bot is set to private by default for your security)
👑 *Prefix:* \`${config.prefix}\`

━━━━━━━━━━━━━━━━━━━━
📢 *IMPORTANT: Follow Our Channel*
Click the link below to follow our channel and receive direct developer support & updates!
👉 ${followChannelUrl}
━━━━━━━━━━━━━━━━━━━━

Type \`${config.prefix}help\` in this chat to see all available commands!`;

            await sock.sendMessage(ownerJid, { text: onboardingWelcome });
        }
    });

    // Handle incoming messages
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.key.fromMe && chatUpdate.type === 'notify') {
                await handleMessage(sock, mek);
            }
        } catch (e) {
            console.error("Error in messages.upsert:", e);
        }
    });

    // Handle Group Welcome message when a new participant joins
    sock.ev.on('group-participants.update', async (anu) => {
        try {
            if (anu.action === 'add' && config.settings.welcome) {
                const chatJid = anu.id;
                const participants = anu.participants;
                const channelUrl = config.channelUrl || "https://whatsapp.com/channel/0029VajW7P829759S4vJkM3e";
                
                for (const num of participants) {
                    const welcomeText = `👋 *Welcome @${num.split('@')[0]} to the group!*

We are thrilled to have you here. Please respect the group rules and have a wonderful time!

━━━━━━━━━━━━━━━━━━━━
📢 *Stay Connected! Follow Our Channel:*
👉 ${channelUrl}
━━━━━━━━━━━━━━━━━━━━`;
                    await sock.sendMessage(chatJid, {
                        text: welcomeText,
                        mentions: [num]
                    });
                }
            }
        } catch (e) {
            console.error("Error in group-participants.update:", e);
        }
    });
}

// Start Server
server.listen(PORT, () => {
    console.log(`🌐 Empire MD Web Onboarding Portal running on port ${PORT}`);
});

module.exports = {
    initializeWhatsAppBot
};