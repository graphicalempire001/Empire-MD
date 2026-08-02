// lib/channelCard.js — shared channel "view channel" card (newsletter-style)
const axios = require('axios');
const config = require('../config');

function resolveBotName(sock, settings) {
  return (
    (settings && settings.botName) ||
    (sock && sock.botSettings && sock.botSettings.botName) ||
    config.botName ||
    'Empire MD'
  );
}

function resolveChannelMeta(sock, settings) {
  const botName = resolveBotName(sock, settings);
  return {
    botName,
    channelUrl:
      (settings && settings.channelUrl) ||
      config.channelUrl ||
      'https://whatsapp.com/channel/0029VaI3OXiF6smuq5LxxN15',
    channelName:
      (settings && settings.channelName) ||
      config.channelName ||
      botName,
    newsletterJid:
      (settings && settings.newsletterJid) ||
      config.newsletterJid ||
      null,
    thumbUrl:
      (settings && settings.channelThumb) ||
      config.channelThumb ||
      config.menuThumb ||
      null
  };
}

async function fetchThumb(url) {
  if (!url) return null;
  try {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
    return Buffer.from(res.data);
  } catch (_) {
    return null;
  }
}

/**
 * Build contextInfo that mimics a normal WhatsApp channel forward card.
 * Title uses a verified-style badge emoji.
 */
async function buildChannelCard(sock, settings, opts = {}) {
  const meta = resolveChannelMeta(sock, settings);
  const title = opts.title || `✅ ${meta.channelName}`;
  const body = opts.body || 'Tap to view channel';
  const thumb = await fetchThumb(meta.thumbUrl);

  const ctx = {
    forwardingScore: 999,
    isForwarded: true,
    externalAdReply: {
      title,
      body,
      mediaType: 1,
      renderLargerThumbnail: true,
      showAdAttribution: false,
      sourceUrl: meta.channelUrl,
      mediaUrl: meta.channelUrl
    }
  };

  if (thumb) {
    ctx.externalAdReply.thumbnail = thumb;
  } else if (meta.thumbUrl) {
    ctx.externalAdReply.thumbnailUrl = meta.thumbUrl;
  }

  // Real channel-forward presentation when newsletter JID is configured
  if (meta.newsletterJid) {
    ctx.forwardedNewsletterMessageInfo = {
      newsletterJid: meta.newsletterJid,
      newsletterName: `✅ ${meta.channelName}`,
      serverMessageId: opts.serverMessageId || 1
    };
  }

  return ctx;
}

/** Short verified footer line for captions (no raw URL needed when card is attached). */
function verifiedFooter(botName) {
  return `\n\n✅ *${botName || 'Empire MD'}* · Official Channel`;
}

module.exports = {
  resolveBotName,
  resolveChannelMeta,
  buildChannelCard,
  verifiedFooter,
  fetchThumb
};
