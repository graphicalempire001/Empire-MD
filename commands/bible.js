const axios = require('axios');

const RANDOM_REFS = [
    "John 3:16", "Psalm 23:1", "Philippians 4:13", "Jeremiah 29:11",
    "Romans 8:28", "Proverbs 3:5-6", "Isaiah 41:10", "Matthew 6:33",
    "Joshua 1:9", "Psalm 46:1", "1 Corinthians 13:4-7", "Romans 12:2",
    "Galatians 5:22-23", "Hebrews 11:1", "Matthew 11:28", "Psalm 91:1-2"
];

module.exports = {
    // 📖 Bible verse lookup or random (Alias: bible, verse)
    bible: async ({ sock, chatJid, mek, text }) => {
        try {
            const ref = (text && text.trim())
                ? text.trim()
                : RANDOM_REFS[Math.floor(Math.random() * RANDOM_REFS.length)];

            const res = await axios.get(
                `https://bible-api.com/${encodeURIComponent(ref)}?translation=kjv`,
                { timeout: 12000 }
            );

            if (!res.data || !res.data.text) {
                return sock.sendMessage(chatJid, { text: `❌ Couldn't find *${ref}*. Try e.g. *.bible John 3:16*` }, { quoted: mek });
            }

            const message = `📖 *HOLY BIBLE*
━━━━━━━━━━━━━━━━━━━━
✝️ *${res.data.reference || ref}*

_"${res.data.text.trim()}"_

📚 *${res.data.translation_name || "KJV"}*
━━━━━━━━━━━━━━━━━━━━
🙏 _Be blessed._`;

            await sock.sendMessage(chatJid, { text: message }, { quoted: mek });
        } catch (err) {
            console.error("Bible error:", err.message);
            await sock.sendMessage(chatJid, {
                text: "❌ Bible service is busy. Try *.bible John 3:16* or just *.bible* for a random verse."
            }, { quoted: mek });
        }
    },
    verse: async (args) => module.exports.bible(args)
};
