// lib/botWorker.js
process.on('uncaughtException', (err) => {
  process.send({ type: 'error', error: err.message });
  process.exit(1);
});

const { makeWASocket, useMultiFileAuthState, DisconnectReason,
  Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const { handleMessage } = require('./msgHandler');
const { getSettings, registerBot, incrementUsage, markBotOffline } = require('./database');
const config = require('../config');

const { sessionId, botName, cleanPhone, mode, SESSIONS_ROOT } = JSON.parse(process.env.BOT_CONFIG);

const messageCache = new Map();
const MSG_CACHE_LIMIT = 400;

async function start() {
  const sessionFolder = path.join(SESSIONS_ROOT, sessionId);
  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version, auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: Browsers.ubuntu('Chrome'),
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 15000,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const mek of messages) {
      if (!mek.message) continue;
      // cache + handle
      if (messageCache.size >= MSG_CACHE_LIMIT) {
        messageCache.delete(messageCache.keys().next().value);
      }
      messageCache.set(mek.key.id, mek);
      try { await handleMessage(sock, mek); } catch (e) {
        process.send({ type: 'handleError', error: e.message });
      }
    }
  });

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) process.send({ type: 'qr', qr });
    if (connection === 'open') {
      process.send({ type: 'connected', sessionId });
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        process.send({ type: 'loggedOut', sessionId });
        process.exit(0);
      } else {
        setTimeout(start, 3000); // reconnect inside this isolated process
      }
    }
  });

  if (mode === 'pair' && !state.creds.registered && cleanPhone) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(cleanPhone);
        process.send({ type: 'pairingCode', code: code?.match(/.{1,4}/g)?.join('-') });
      } catch (e) {
        process.send({ type: 'error', error: e.message });
      }
    }, 4000);
  }
}

start();
