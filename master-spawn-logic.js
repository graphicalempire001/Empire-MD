const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');

// Replace the startSession function in your server.js with this child_process implementation
// This ensures that every bot connection runs in its own memory space and does not affect the master server.

const activeSessions = {};
const SESSIONS_ROOT = path.join(__dirname, 'sessions');

async function startSession(sessionId, botName, cleanPhone, mode = 'pair') {
    if (activeSessions[sessionId]) {
        console.log(`⚠️ Session ${sessionId} is already running.`);
        return;
    }

    console.log(`🚀 Spawning new isolated process for session: ${sessionId}`);

    // Create a new child process running bot-runner.js
    const child = fork(path.join(__dirname, 'bot-runner.js'), [], {
        env: {
            ...process.env,
            SESSION_ID: sessionId,
            BOT_NAME: botName,
            CLEAN_PHONE: cleanPhone,
            CONNECTION_MODE: mode
        }
    });

    // Save session info with reference to the child process
    activeSessions[sessionId] = {
        botName,
        phoneNumber: cleanPhone,
        status: 'pairing',
        pairingCode: null,
        qr: null,
        mode,
        process: child,
        expiry: Date.now() + 120000
    };

    // Listen to updates from the isolated worker process
    child.on('message', (msg) => {
        const { type, data } = msg;

        if (activeSessions[sessionId]) {
            if (type === 'qr') {
                activeSessions[sessionId].qr = data.qr;
            } else if (type === 'status') {
                activeSessions[sessionId].status = data.status;
                if (data.status === 'connected') {
                    activeSessions[sessionId].qr = null;
                }
            } else if (type === 'settingsUpdated') {
                console.log(`⚙️ Session settings successfully synced in database for ${sessionId}`);
            }
        }
    });

    child.on('exit', (code, signal) => {
        console.log(`🚪 Isolated bot process ${sessionId} exited with code ${code} (signal: ${signal})`);
        delete activeSessions[sessionId];
    });

    child.on('error', (err) => {
        console.error(`❌ Error in isolated process ${sessionId}:`, err);
        activeSessions[sessionId].status = 'error';
    });
}

// Function to stop and clean up an active session safely from the Admin Controller
async function killSession(sessionId) {
    const session = activeSessions[sessionId];
    if (session && session.process) {
        console.log(`🛑 Stopping process for session: ${sessionId}`);
        session.process.send({ type: 'shutdown' });
        // Force kill if it doesn't shut down in 5 seconds
        setTimeout(() => {
            if (activeSessions[sessionId]) {
                session.process.kill('SIGKILL');
            }
        }, 5000);
    }
    
    delete activeSessions[sessionId];
    try { fs.rmSync(path.join(SESSIONS_ROOT, sessionId), { recursive: true, force: true }); } catch (_) {}
}
