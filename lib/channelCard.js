// lib/channelCard.js — shared channel "view channel" card (newsletter-style)
const axios = require('axios');
const path = require('path');
const config = require('../config');

// FIX: compositing lib to stamp the real verified-badge.png onto the
// channel thumbnail corner (WhatsApp text can't render inline SVG/PNG,
// so the badge lives on the card's image instead).
const Jimp = require('jimp');

const BADGE_PATH = path.join(__dirname, '..', 'assets', 'verified-badge.png');

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
 * Stamp the verified-badge.png onto the bottom-right corner of a
 * thumbnail buffer. Falls back to the plain thumbnail (or null) on
 * any failure so a badge issue never breaks the whole card.
 */
async function stampVerifiedBadge(thumbBuffer) {
  if (!thumbBuffer) return thumbBuffer;
  try {
    const base = await Jimp.read(thumbBuffer);
    const badge = await Jimp.read(BADGE_PATH);

    // Badge sized to ~32% of the shortest side of the thumbnail
    const targetSize = Math.round(Math.min(base.bitmap.width, base.bitmap.height) * 0.32);
    badge.resize(targetSize, targetSize);

    const x = base.bitmap.width - targetSize - Math.round(targetSize * 0.08);
    const y = base.bitmap.height - targetSize - Math.round(targetSize * 0.08);

    base.composite(badge, x, y, { mode: Jimp.BLEND_SOURCE_OVER, opacitySource: 1 });

    return await base.getBufferAsync(Jimp.MIME_JPEG);
  } catch (e) {
    console.error('verified-badge stamp failed:', e.message);
    return thumbBuffer; // graceful fallback — unbadged thumbnail still works
  }
}

/**
 * Build contextInfo that mimics a normal WhatsApp channel forward card.
 * Title uses a verified-style badge emoji; the card image now carries
 * the real rendered verified-badge.png stamped onto its corner.
 */
async function buildChannelCard(sock, settings, opts = {}) {
  const meta = resolveChannelMeta(sock, settings);
  const title = opts.title || `📣 ${meta.channelName}`;
  const body = opts.body || 'Tap to view channel';

  let thumb = await fetchThumb(meta.thumbUrl);
  thumb = await stampVerifiedBadge(thumb);

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
      newsletterName: `📨 ${meta.channelName}`,
      serverMessageId: opts.serverMessageId || 1
    };
  }

  return ctx;
}

/** Short verified footer line for captions (no raw URL needed when card is attached). */
function verifiedFooter(botName) {
  return `\n\n🧑‍💻 *${botName || 'Empire MD'}* · Official Channel`;
}

module.exports = {
  resolveBotName,
  resolveChannelMeta,
  buildChannelCard,
  verifiedFooter,
  fetchThumb,
  stampVerifiedBadge
};
