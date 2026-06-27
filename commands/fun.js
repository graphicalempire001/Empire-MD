const axios = require('axios');

module.exports = {
    // 🎭 Random Joke
    joke: async ({ sock, chatJid, mek }) => {
        try {
            const res = await axios.get("https://official-joke-api.appspot.com/random_joke");
            const { setup, punchline } = res.data;
            await sock.sendMessage(chatJid, { text: `🤪 *Joke Time!* 🤪

*Q:* ${setup}

*A:* _${punchline}_` }, { quoted: mek });
        } catch (err) {
            await sock.sendMessage(chatJid, { text: "❌ Failed to load joke. Why did the computer show up at work? To get a byte to eat! 😂" }, { quoted: mek });
        }
    },

    // 🧠 Random Fact
    fact: async ({ sock, chatJid, mek }) => {
        try {
            const res = await axios.get("https://uselessfacts.jsph.pl/api/v2/facts/random");
            const factText = res.data.text;
            await sock.sendMessage(chatJid, { text: `🧠 *Did You Know?* 🧠

${factText}` }, { quoted: mek });
        } catch (err) {
            await sock.sendMessage(chatJid, { text: "❌ Failed to fetch fact. Honey never spoils. You can theoretically eat 3,000-year-old honey!" }, { quoted: mek });
        }
    },

    // 💡 Activity Suggestion (Alias: act, bored) - KEYLESS PUBLIC API
    bored: async ({ sock, chatJid, mek }) => {
        try {
            const res = await axios.get("https://www.boredapi.com/api/activity").catch(() => null);
            if (res && res.data) {
                const { activity, type, participants } = res.data;
                await sock.sendMessage(chatJid, { text: `💡 *Feeling Bored? Try this:* 

🎯 *Activity:* ${activity}
🏷️ *Type:* ${type}
👥 *Participants:* ${participants}` }, { quoted: mek });
            } else {
                // Fallback suggestion
                await sock.sendMessage(chatJid, { text: '💡 *Feeling Bored? Try this:* 

🎯 *Activity:* Learn a new coding language or clean your workspace!
🏷️ *Type:* productive
👥 *Participants:* 1' }, { quoted: mek });
            }
        } catch (err) {
            await sock.sendMessage(chatJid, { text: "❌ Failed to fetch bored activity. Go learn something new today! 🚀" }, { quoted: mek });
        }
    },
    act: async (args) => module.exports.bored(args),

    // 🤷 Random Developer Excuses (Alias: excuse) - KEYLESS PUBLIC API
    excuse: async ({ sock, chatJid, mek }) => {
        try {
            const res = await axios.get("https://developer-excuses.herokuapp.com/").catch(() => null);
            let excuse = "It worked on my machine! 🤷‍♂️";
            if (res && res.data) {
                excuse = res.data;
            }
            await sock.sendMessage(chatJid, { text: `🤷‍♂️ *Developer Excuse:* 

_"${excuse.trim()}"_` }, { quoted: mek });
        } catch (err) {
            await sock.sendMessage(chatJid, { text: "🤷‍♂️ *Developer Excuse:* 

_"It was a compiler error!"_ 🤷‍♂️" }, { quoted: mek });
        }
    }
};
