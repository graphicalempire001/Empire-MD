const fs = require('fs');

const file = 'commands/utility.js';
if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');

    // Replace the raw channel URL link in the text representation with a clean anchor label
    const oldChannelLine = '┃ ${config.channelUrl}';
    const newChannelLine = '┃ 🔗 _Tap the card below to join!_';
    if (content.includes(oldChannelLine)) {
        content = content.replace(oldChannelLine, newChannelLine);
    }

    // Replace raw sendMessage with structured card contextInfo safely and cleanly
    // and use 'jpegThumbnail' with a Base64-encoded small PNG buffer (universal Baileys standard)
    const oldSend = 'await sock.sendMessage(chatJid, { text: menu }, { quoted: mek });';
    const newSend = `await sock.sendMessage(chatJid, {
            text: menu,
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                externalAdReply: {
                    title: \`Join \${config.botName} Official Channel\`,
                    body: "Tap here to follow and get latest updates!",
                    mediaType: 1, // Standard text link card
                    thumbnail: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"), // 1x1 transparent PNG buffer
                    sourceUrl: config.channelUrl,
                    renderLargerThumbnail: true,
                    showAdAttribution: true
                }
            }
        }, { quoted: mek });`;

    if (content.includes(oldSend)) {
        content = content.replace(oldSend, newSend);
        fs.writeFileSync(file, content, 'utf8');
        console.log('SUCCESS: commands/utility.js updated with solid externalAdReply structure');
    } else {
        // Fallback: If it's already modified, replace the whole contextInfo send structure with this clean one
        const pattern = /await\s+sock\.sendMessage\(\s*chatJid\s*,\s*\{\s*text:\s*menu[\s\S]*?\}\s*,\s*\{\s*quoted:\s*mek\s*\}\);/;
        if (content.match(pattern)) {
            content = content.replace(pattern, newSend);
            fs.writeFileSync(file, content, 'utf8');
            console.log('SUCCESS: Fallback replacement applied clean externalAdReply structure');
        } else {
            console.log('Error: Could not locate target sendMessage patterns in commands/utility.js');
        }
    }
} else {
    console.log('Error: File utility.js does not exist');
}
