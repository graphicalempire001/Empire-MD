// Empire MD - Profile Picture command (.pp / .getpp / .profile)
async function pp(ctx) {
  const { sock, mek, chatJid, sender, args, quoted, contextInfo } = ctx;

  // Resolve target: @mention → replied message → typed number → self
  let target;
  const mentioned = (contextInfo && contextInfo.mentionedJid) || [];
  if (mentioned.length) {
    target = mentioned[0];
  } else if (quoted && quoted.sender) {
    target = quoted.sender;
  } else if (args[0]) {
    const digits = args[0].replace(/[^0-9]/g, '');
    target = digits ? `${digits}@s.whatsapp.net` : sender;
  } else {
    target = sender;
  }

  const who = target.split('@')[0];
  try {
    // 'image' = full resolution; falls back to preview if unavailable
    const url = await sock.profilePictureUrl(target, 'image');
    await sock.sendMessage(chatJid, {
      image: { url },
      caption: `🖼️ *Profile picture* of @${who}`,
      mentions: [target]
    }, { quoted: mek });
  } catch (e) {
    await sock.sendMessage(chatJid, {
      text: `⚠️ Couldn't fetch a profile picture for @${who}. They may have no photo set, or it's hidden by their privacy settings.`,
      mentions: [target]
    }, { quoted: mek });
  }
}

module.exports = { pp, getpp: pp, profile: pp };
