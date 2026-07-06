const fs = require('fs');

const file = 'commands/utility.js';
if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');

    // WhatsApp's Baileys library strictly expects 'jpegThumbnail' to be a binary image Buffer 
    // to render the card at the bottom. We also ensure config.channelUrl is placed at the end 
    // of the text so that WhatsApp forces the link preview card to render.
    const oldSend = 'await sock.sendMessage(chatJid, { text: menu }, { quoted: mek });';
    const newSend = `await sock.sendMessage(chatJid, {
            text: menu + "\n\n*Join here:* " + config.channelUrl,
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                externalAdReply: {
                    title: \`Join \${config.botName} Official Channel\`,
                    body: "Tap here to follow and get latest updates!",
                    mediaType: 1, // Standard text link card
                    jpegThumbnail: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"), // Tiny binary 1x1 image Buffer
                    sourceUrl: config.channelUrl,
                    renderLargerThumbnail: true,
                    showAdAttribution: true
                }
            }
        }, { quoted: mek });`;

    // Direct clean regex/string replacement that covers both untouched and partially edited states
    const pattern = /await\s+sock\.sendMessage\(\s*chatJid\s*,\s*\{\s*text:\s*menu[\s\S]*?\}\s*,\s*\{\s*quoted:\s*mek\s*\}\);/;
    
    if (content.match(pattern)) {
        content = content.replace(pattern, newSend);
        fs.writeFileSync(file, content, 'utf8');
        console.log('SUCCESS: commands/utility.js updated with standard Baileys binary jpegThumbnail Buffer!');
    } else if (content.includes(oldSend)) {
        content = content.replace(oldSend, newSend);
        fs.writeFileSync(file, content, 'utf8');
        console.log('SUCCESS: commands/utility.js updated directly from original state.');
    } else {
        console.log('Error: Could not locate target sendMessage patterns in commands/utility.js');
    }
} else {
    console.log('Error: File utility.js does not exist');
}
