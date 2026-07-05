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
    
    // Replace raw sendMessage with structured card contextInfo
    const oldSend = 'await sock.sendMessage(chatJid, { text: menu }, { quoted: mek });';
    const newSend = 'await sock.sendMessage(chatJid, {
            text: menu,
            contextInfo: {
                externalAdReply: {
                    title: `Join ${config.botName} Official Channel`,
                    body: "Click here to follow our official channel!",
                    thumbnailUrl: "https://avatars.githubusercontent.com/u/292783227?v=4",
                    mediaType: 1,
                    renderLargerThumbnail: true,
                    sourceUrl: config.channelUrl
                }
            }
        }, { quoted: mek });';
    
    if (content.includes(oldSend)) {
        content = content.replace(oldSend, newSend);
        fs.writeFileSync(file, content, 'utf8');
        console.log('SUCCESS: commands/utility.js updated successfully!');
    } else {
        console.log('Error: Could not locate oldSend string');
    }
} else {
    console.log('Error: File utility.js does not exist');
}
