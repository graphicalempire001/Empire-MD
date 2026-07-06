const fs = require('fs');

const file = 'commands/utility.js';
if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');

    // To ensure the button-like card displays at the bottom of the WhatsApp chat bubble on all mobile/web platforms,
    // Baileys needs contextInfo to contain the externalAdReply object, and standard text links require:
    // 1. The URL must be actively matched inside the text body.
    // 2. We use 'jpegThumbnail' with a Base64-encoded image buffer (far more reliable than thumbnailUrl on many versions)
    // 3. showAdAttribution: true and renderLargerThumbnail: true are preserved.
    
    const targetPattern = /await\s+sock\.sendMessage\(\s*chatJid\s*,\s*\{\s*text:\s*menu[\s\S]*?\}\s*,\s*\{\s*quoted:\s*mek\s*\}\);/;

    // We prepare a clean, base64-encoded 1x1 transparent/small placeholder PNG buffer to use as jpegThumbnail.
    // This satisfies Baileys' strict requirement of a binary Buffer for jpegThumbnail to force rendering the card.
    const replacement = `await sock.sendMessage(chatJid, {
            text: menu + "\n\n*Join here:* " + config.channelUrl,
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                externalAdReply: {
                    title: \`Join \${config.botName} Official Channel\`,
                    body: "Tap here to follow and get latest updates!",
                    mediaType: 1, // Standard text link
                    thumbnail: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"), // Tiny 1x1 PNG Buffer
                    sourceUrl: config.channelUrl,
                    renderLargerThumbnail: true,
                    showAdAttribution: true
                }
            }
        }, { quoted: mek });`;

    if (content.match(targetPattern)) {
        content = content.replace(targetPattern, replacement);
        fs.writeFileSync(file, content, 'utf8');
        console.log('SUCCESS_UTILITY_CARD_BUFFER_UPDATED');
    } else {
        const fallbackPattern = /contextInfo:\s*\{[\s\S]*?\}\s*\}\s*,\s*\{\s*quoted:\s*mek\s*\}/;
        if (content.match(fallbackPattern)) {
            const fallbackReplacement = `contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                externalAdReply: {
                    title: \`Join \${config.botName} Official Channel\`,
                    body: "Tap here to follow and get latest updates!",
                    mediaType: 1,
                    thumbnail: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"),
                    sourceUrl: config.channelUrl,
                    renderLargerThumbnail: true,
                    showAdAttribution: true
                }
            }
        }, { quoted: mek }`;
            content = content.replace(fallbackPattern, fallbackReplacement);
            // Replace text field logic if matched as well
            content = content.replace(/text:\s*menu[\s\S]*?,/g, 'text: menu + "\n\n*Join here:* " + config.channelUrl,');
            fs.writeFileSync(file, content, 'utf8');
            console.log('SUCCESS_FALLBACK_REPLACEMENT');
        } else {
            console.log('Error: Could not locate target sendMessage patterns');
        }
    }
} else {
    console.log('Error: File utility.js does not exist');
}
