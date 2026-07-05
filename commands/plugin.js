const fs = require('fs');
const path = require('path');
const axios = require('axios');

module.exports = {
    // 🔌 Plugin Installer (Alias: installplugin, addplugin)
    plugin: async ({ sock, chatJid, mek, text, isOwner, prefix }) => {
        if (!isOwner) {
            return sock.sendMessage(chatJid, { text: "❌ This is an owner-only command!" }, { quoted: mek });
        }

        if (!text) {
            return sock.sendMessage(chatJid, { 
                text: `❌ *Usage:* \`${prefix}plugin <plugin_raw_url>\`

Provide the raw GitHub/Gist URL of the JS plugin to download and register it dynamically.` 
            }, { quoted: mek });
        }

        const url = text.trim();
        const commandsDir = path.join(__dirname, '../commands');
        
        // Match a valid URL
        const isUrl = url.startsWith('http://') || url.startsWith('https://');
        if (!isUrl) {
            return sock.sendMessage(chatJid, { text: "❌ Please provide a valid HTTP/HTTPS raw JS file URL." }, { quoted: mek });
        }

        try {
            await sock.sendMessage(chatJid, { text: "📥 Fetching and validating the plugin file..." }, { quoted: mek });

            const response = await axios.get(url, { responseType: 'text' });
            const code = response.data;

            if (typeof code !== 'string' || !code.includes('module.exports')) {
                return sock.sendMessage(chatJid, { text: "❌ Invalid plugin format! The file must be valid JavaScript and export functions using `module.exports`." }, { quoted: mek });
            }

            // Extract a filename from URL or generate a default one
            let filename = url.split('/').pop().split('?')[0];
            if (!filename.endsWith('.js')) {
                filename = `plugin_${Date.now()}.js`;
            }

            const targetPath = path.join(commandsDir, filename);

            // Write plugin file to commands folder
            fs.writeFileSync(targetPath, code, 'utf-8');

            // Dynamically register the new commands into the live session
            try {
                // Invalidate node require cache to load fresh file safely
                delete require.cache[require.resolve(targetPath)];
                const newPlugin = require(targetPath);
                
                const loadedCommands = require('../lib/commands');
                const addedList = [];

                Object.keys(newPlugin).forEach(cmdName => {
                    if (typeof newPlugin[cmdName] === 'function') {
                        loadedCommands[cmdName] = newPlugin[cmdName];
                        addedList.push(cmdName);
                    }
                });

                if (addedList.length === 0) {
                    // Cleanup invalid file
                    fs.unlinkSync(targetPath);
                    return sock.sendMessage(chatJid, { text: "❌ Failed to load: No executable functions found in `module.exports`." }, { quoted: mek });
                }

                await sock.sendMessage(chatJid, {
                    text: `✅ *Plugin Installed Successfully!*

📦 *File saved as:* \`${filename}\`
🎮 *Registered Commands:* ${addedList.map(c => `\`${prefix}${c}\``).join(', ')}

_These commands are now active and ready to be used live!_`
                }, { quoted: mek });

            } catch (err) {
                // Cleanup on failure
                if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
                return sock.sendMessage(chatJid, { text: `❌ Compilation or import error in plugin: ${err.message}` }, { quoted: mek });
            }

        } catch (err) {
            return sock.sendMessage(chatJid, { text: `❌ Network error fetching plugin: ${err.message}` }, { quoted: mek });
        }
    }
};
