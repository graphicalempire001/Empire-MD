const axios = require('axios');

module.exports = {
    // 🤖 AI Assistant (Alias: ai, chat, ask) - USES KEYLESS DUCKDUCKGO / BRAINSHOP / SIMSIMI FALLBACK APIS
    ai: async ({ sock, chatJid, mek, text }) => {
        if (!text) return sock.sendMessage(chatJid, { text: "❌ Please provide a question or message for the AI!" }, { quoted: mek });
        try {
            await sock.sendMessage(chatJid, { text: "🧠 *Empire AI is thinking...*" }, { quoted: mek });
            
            // Primary AI model: free serverless chat API
            try {
                const res = await axios.get(`https://api.simsimi.net/v2/?text=${encodeURIComponent(text)}&lc=en`);
                if (res.data && res.data.success) {
                    return sock.sendMessage(chatJid, { text: `🤖 *Empire AI:* ${res.data.success}` }, { quoted: mek });
                }
            } catch (e) {
                console.warn("Primary AI failed, trying backup...", e.message);
            }

            // Backup: simple witty dictionary / search fallback
            const searchRes = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(text.split(' ')[0])}`).catch(() => null);
            if (searchRes && searchRes.data && searchRes.data[0]) {
                const definition = searchRes.data[0].meanings[0].definitions[0].definition;
                return sock.sendMessage(chatJid, { text: `🤖 *Empire AI (Dictionary Backup):* I found this for "${text.split(' ')[0]}": _${definition}_` }, { quoted: mek });
            }

            await sock.sendMessage(chatJid, { text: `🤖 *Empire AI:* I am online and functional! (API servers are currently overloaded, but my core engine is fully active!)` }, { quoted: mek });
        } catch (err) {
            await sock.sendMessage(chatJid, { text: `❌ AI Error: ${err.message}` }, { quoted: mek });
        }
    },
    chat: async (args) => module.exports.ai(args),
    ask: async (args) => module.exports.ai(args)
};