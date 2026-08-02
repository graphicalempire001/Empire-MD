const axios = require('axios');

module.exports = {
  // 🎭 Random Joke
  joke: async ({ sock, chatJid, mek }) => {
    try {
      const res = await axios.get("https://official-joke-api.appspot.com/random_joke", { timeout: 12000 });
      const { setup, punchline } = res.data;
      await sock.sendMessage(chatJid, {
        text: `🤪 *Joke Time!*\n*Q:* ${setup}\n*A:* _${punchline}_`
      }, { quoted: mek });
    } catch (err) {
      await sock.sendMessage(chatJid, {
        text: "❌ Failed to load joke. Why did the computer show up at work? To get a byte to eat! 😂"
      }, { quoted: mek });
    }
  },

  // 🧠 Random Fact
  fact: async ({ sock, chatJid, mek }) => {
    try {
      const res = await axios.get("https://uselessfacts.jsph.pl/api/v2/facts/random", { timeout: 12000 });
      await sock.sendMessage(chatJid, {
        text: `🧠 *Did You Know?*\n${res.data.text}`
      }, { quoted: mek });
    } catch (err) {
      await sock.sendMessage(chatJid, {
        text: "❌ Failed to fetch fact. Honey never spoils — you can theoretically eat 3,000-year-old honey!"
      }, { quoted: mek });
    }
  },

  // 💡 Activity suggestion
  bored: async ({ sock, chatJid, mek }) => {
    try {
      const res = await axios.get("https://www.boredapi.com/api/activity", { timeout: 10000 }).catch(() => null);
      if (res && res.data?.activity) {
        const { activity, type, participants } = res.data;
        await sock.sendMessage(chatJid, {
          text: `💡 *Feeling Bored? Try this:*\n🎯 *Activity:* ${activity}\n🏷️ *Type:* ${type}\n👥 *Participants:* ${participants}`
        }, { quoted: mek });
      } else {
        await sock.sendMessage(chatJid, {
          text: `💡 *Feeling Bored? Try this:*\n🎯 *Activity:* Learn a new skill or clean your workspace!\n🏷️ *Type:* productive\n👥 *Participants:* 1`
        }, { quoted: mek });
      }
    } catch (err) {
      await sock.sendMessage(chatJid, { text: "❌ Failed to fetch activity. Go learn something new today! 🚀" }, { quoted: mek });
    }
  },
  act: async (args) => module.exports.bored(args)
};
