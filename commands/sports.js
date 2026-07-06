const axios = require('axios');

module.exports = {

  // ⚽ Live & recent football match scores
  live: async ({ sock, chatJid, mek }) => {
    await sock.sendMessage(chatJid, { text: '⚽ Fetching live football scores...' }, { quoted: mek });

    try {
      const res = await axios.get('https://www.thesportsdb.com/api/v1/json/3/latestsoccer.php', { timeout: 15000 });
      const events = res.data?.teams || res.data?.events || [];

      if (!events.length)
        return sock.sendMessage(chatJid, { text: '⚽ No live matches right now. Try again during major league kick-off times!' }, { quoted: mek });

      let report = '⚽ *LIVE & RECENT FOOTBALL SCORES* ⚽\n\n';
      events.slice(0, 12).forEach(ev => {
        const home  = ev.strHomeTeam  || ev.strTeam || 'Home';
        const away  = ev.strAwayTeam  || 'Away';
        const hGoal = ev.intHomeScore ?? '—';
        const aGoal = ev.intAwayScore ?? '—';
        const lgue  = ev.strLeague    || 'Football';
        const stat  = ev.strStatus    || '';
        report += `🏟️ *${lgue}*\n📌 ${home}  *${hGoal} – ${aGoal}*  ${away}  _(${stat})_\n\n`;
      });
      report += '_Source: TheSportsDB · Empire-MD_';

      await sock.sendMessage(chatJid, { text: report }, { quoted: mek });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Failed to fetch scores: ${e.message}` }, { quoted: mek });
    }
  },

  foot: async (args) => module.exports.live(args),

  // 📺 Search match highlights & stream links
  stream: async ({ sock, chatJid, mek, text }) => {
    if (!text)
      return sock.sendMessage(chatJid, { text: '❌ Provide a team or match name!\n*Usage:* `.stream Manchester City`' }, { quoted: mek });

    await sock.sendMessage(chatJid, { text: `📺 Searching highlights for *${text}*...` }, { quoted: mek });

    try {
      const res = await axios.get(
        `https://www.thesportsdb.com/api/v1/json/3/searchfilename.php?e=${encodeURIComponent(text)}`,
        { timeout: 15000 }
      );
      const matches = res.data?.event || [];

      if (!matches.length)
        return sock.sendMessage(chatJid, { text: `❌ No highlights found for *${text}*. Try a different team or match name.` }, { quoted: mek });

      let report = `📺 *MATCH HIGHLIGHTS — ${text.toUpperCase()}*\n\n`;
      matches.slice(0, 5).forEach(m => {
        report += `⚽ *${m.strEvent}*\n`;
        report += `🗓️ Date: ${m.dateEvent || 'N/A'}\n`;
        report += `🏆 ${m.strLeague}\n`;
        report += `🎥 ${m.strVideo || 'No video link yet'}\n\n`;
      });

      await sock.sendMessage(chatJid, { text: report }, { quoted: mek });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Stream search failed: ${e.message}` }, { quoted: mek });
    }
  }
};
