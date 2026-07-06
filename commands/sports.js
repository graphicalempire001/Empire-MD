const axios = require('axios');

module.exports = {
  live: async ({ sock, chatJid, mek }) => {
    await sock.sendMessage(chatJid, { text: "⚽ Fetching live matches and football scores..." }, { quoted: mek });
    try {
      const res = await axios.get('https://www.thesportsdb.com/api/v1/json/3/latestsoccer.php', { timeout: 15000 });
      const events = res.data?.teams || res.data?.events || [];
      if (!events || events.length === 0) {
        return sock.sendMessage(chatJid, { text: "⚽ *[FOOTBALL LIVE SCORE]*\n\nNo live international matches are currently being reported." }, { quoted: mek });
      }
      let report = "⚽ *[FOOTBALL LIVE & RECENT SCORES]* ⚽\n\n";
      events.slice(0, 15).forEach(ev => {
        const home = ev.strHomeTeam || ev.strTeam || 'Home Team';
        const away = ev.strAwayTeam || 'Away Team';
        const homeScore = ev.intHomeScore ?? '-';
        const awayScore = ev.intAwayScore ?? '-';
        const league = ev.strLeague || 'International';
        const status = ev.strStatus || 'Live';
        report += "🏁 " + league + "\n👉 " + home + "  *" + homeScore + " - " + awayScore + "*  " + away + " (" + status + ")\n\n";
      });
      report += "_Powered by Empire-MD Sports Update_";
      await sock.sendMessage(chatJid, { text: report }, { quoted: mek });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: "❌ Failed to fetch sports data: " + e.message }, { quoted: mek });
    }
  },
  foot: async (args) => {
    return module.exports.live(args);
  },
  stream: async ({ sock, chatJid, mek, text }) => {
    if (!text) {
      return sock.sendMessage(chatJid, { text: "❌ Please provide a team or match name! (e.g. .stream Real Madrid)" }, { quoted: mek });
    }
    await sock.sendMessage(chatJid, { text: "📺 Searching for stream highlights/match videos for *" + text + "*..." }, { quoted: mek });
    try {
      const res = await axios.get('https://www.thesportsdb.com/api/v1/json/3/searchfilename.php?e=' + encodeURIComponent(text), { timeout: 15000 });
      const matches = res.data?.event || [];
      if (!matches || matches.length === 0) {
        return sock.sendMessage(chatJid, { text: "❌ No active streams or video highlights found for *" + text + "*." }, { quoted: mek });
      }
      let report = "📺 *[MATCH HIGHLIGHTS & STREAMS]* 📺\n\n";
      matches.slice(0, 5).forEach(m => {
        report += "⚽ *" + m.strEvent + "*\n🗓️ Date: " + (m.dateEvent || 'N/A') + "\n🏆 League: " + m.strLeague + "\n🎥 Video Link: " + (m.strVideo || 'No video link available') + "\n\n";
      });
      await sock.sendMessage(chatJid, { text: report }, { quoted: mek });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: "❌ Failed to fetch streams: " + e.message }, { quoted: mek });
    }
  }
};
