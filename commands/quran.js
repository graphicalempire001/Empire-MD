const axios = require('axios');

const BASE = 'https://api.alquran.cloud/v1';
const TIMEOUT = 20000;

// Common English edition (Asad). Arabic uses quran-uthmani.
const EN_EDITION = 'en.asad';
const AR_EDITION = 'quran-uthmani';

const SURAHS = {
  1: 'Al-Faatiha', 2: 'Al-Baqara', 3: 'Aal-i-Imraan', 4: 'An-Nisaa', 5: 'Al-Maaida',
  6: 'Al-An\'aam', 7: 'Al-A\'raaf', 8: 'Al-Anfaal', 9: 'At-Tawba', 10: 'Yunus',
  11: 'Hud', 12: 'Yusuf', 13: 'Ar-Ra\'d', 14: 'Ibrahim', 15: 'Al-Hijr',
  16: 'An-Nahl', 17: 'Al-Israa', 18: 'Al-Kahf', 19: 'Maryam', 20: 'Taa-Haa',
  21: 'Al-Anbiyaa', 22: 'Al-Hajj', 23: 'Al-Muminoon', 24: 'An-Noor', 25: 'Al-Furqaan',
  26: 'Ash-Shu\'araa', 27: 'An-Naml', 28: 'Al-Qasas', 29: 'Al-Ankaboot', 30: 'Ar-Room',
  31: 'Luqman', 32: 'As-Sajda', 33: 'Al-Ahzaab', 34: 'Saba', 35: 'Faatir',
  36: 'Yaseen', 37: 'As-Saaffaat', 38: 'Saad', 39: 'Az-Zumar', 40: 'Ghafir',
  41: 'Fussilat', 42: 'Ash-Shura', 43: 'Az-Zukhruf', 44: 'Ad-Dukhaan', 45: 'Al-Jaathiya',
  46: 'Al-Ahqaf', 47: 'Muhammad', 48: 'Al-Fath', 49: 'Al-Hujuraat', 50: 'Qaaf',
  51: 'Adh-Dhaariyat', 52: 'At-Tur', 53: 'An-Najm', 54: 'Al-Qamar', 55: 'Ar-Rahmaan',
  56: 'Al-Waaqia', 57: 'Al-Hadid', 58: 'Al-Mujaadila', 59: 'Al-Hashr', 60: 'Al-Mumtahana',
  61: 'As-Saff', 62: 'Al-Jumu\'a', 63: 'Al-Munaafiqoon', 64: 'At-Taghaabun', 65: 'At-Talaaq',
  66: 'At-Tahrim', 67: 'Al-Mulk', 68: 'Al-Qalam', 69: 'Al-Haaqqa', 70: 'Al-Ma\'aarij',
  71: 'Nooh', 72: 'Al-Jinn', 73: 'Al-Muzzammil', 74: 'Al-Muddaththir', 75: 'Al-Qiyaama',
  76: 'Al-Insaan', 77: 'Al-Mursalaat', 78: 'An-Naba', 79: 'An-Naazi\'aat', 80: 'Abasa',
  81: 'At-Takwir', 82: 'Al-Infitaar', 83: 'Al-Mutaffifin', 84: 'Al-Inshiqaaq', 85: 'Al-Burooj',
  86: 'At-Taariq', 87: 'Al-A\'laa', 88: 'Al-Ghaashiya', 89: 'Al-Fajr', 90: 'Al-Balad',
  91: 'Ash-Shams', 92: 'Al-Lail', 93: 'Ad-Dhuhaa', 94: 'Ash-Sharh', 95: 'At-Tin',
  96: 'Al-Alaq', 97: 'Al-Qadr', 98: 'Al-Bayyina', 99: 'Az-Zalzala', 100: 'Al-Aadiyaat',
  101: 'Al-Qaari\'a', 102: 'At-Takaathur', 103: 'Al-Asr', 104: 'Al-Humaza', 105: 'Al-Fil',
  106: 'Quraish', 107: 'Al-Maa\'un', 108: 'Al-Kawthar', 109: 'Al-Kaafiroon', 110: 'An-Nasr',
  111: 'Al-Masad', 112: 'Al-Ikhlaas', 113: 'Al-Falaq', 114: 'An-Naas'
};

async function getJson(path) {
  const res = await axios.get(`${BASE}${path}`, { timeout: TIMEOUT });
  if (res.data?.code !== 200 || !res.data?.data) {
    throw new Error(res.data?.status || 'Quran API error');
  }
  return res.data.data;
}

function formatAyah(ar, en) {
  const surahNo = en.surah?.number || ar.surah?.number;
  const ayahNo = en.numberInSurah || ar.numberInSurah;
  const name = en.surah?.englishName || SURAHS[surahNo] || `Surah ${surahNo}`;
  const arText = ar.text || '';
  const enText = en.text || '';
  return `📖 *Qur'an ${surahNo}:${ayahNo}* — *${name}*

${arText}

_${enText}_`;
}

function parseRef(text) {
  const t = (text || '').trim().toLowerCase();
  if (!t || t === 'random' || t === 'r') return { type: 'random' };

  // 2:255 or 2/255 or 2 255
  let m = t.match(/^(\d{1,3})\s*[:\/\s]\s*(\d{1,3})$/);
  if (m) {
    return { type: 'ayah', surah: parseInt(m[1], 10), ayah: parseInt(m[2], 10) };
  }

  // single number → whole surah (capped for long ones)
  m = t.match(/^(\d{1,3})$/);
  if (m) {
    return { type: 'surah', surah: parseInt(m[1], 10) };
  }

  // name search (simple)
  const name = t.replace(/[^a-z0-9\s'-]/g, '').trim();
  if (name.length >= 2) {
    const found = Object.entries(SURAHS).find(([, n]) =>
      n.toLowerCase().replace(/[^a-z]/g, '').includes(name.replace(/[^a-z]/g, ''))
    );
    if (found) return { type: 'surah', surah: parseInt(found[0], 10) };
  }

  return { type: 'help' };
}

module.exports = {
  // 📖 Qur'an — random / specific ayah / short surah (keyless: api.alquran.cloud)
  quran: async ({ sock, chatJid, mek, text }) => {
    try {
      const ref = parseRef(text);

      if (ref.type === 'help') {
        return sock.sendMessage(chatJid, {
          text: `📖 *Qur'an Command*

• *.quran* — random ayah
• *.quran 2:255* — specific ayah (Surah:Ayah)
• *.quran 1* — Al-Faatiha (short surahs in full)
• *.quran ikhlas* — by surah name

_Arabic + English (Asad). Keyless API._`
        }, { quoted: mek });
      }

      if (ref.type === 'random') {
        const [en, ar] = await Promise.all([
          getJson(`/ayah/random/${EN_EDITION}`),
          getJson(`/ayah/random/${AR_EDITION}`)
        ]);
        // random endpoints return independent ayahs — re-fetch Arabic for the English ref
        const arMatch = await getJson(`/ayah/${en.surah.number}:${en.numberInSurah}/${AR_EDITION}`);
        await sock.sendMessage(chatJid, { text: formatAyah(arMatch, en) }, { quoted: mek });
        return;
      }

      if (ref.type === 'ayah') {
        const { surah, ayah } = ref;
        if (surah < 1 || surah > 114) {
          return sock.sendMessage(chatJid, { text: '❌ Surah must be between 1 and 114.' }, { quoted: mek });
        }
        const [en, ar] = await Promise.all([
          getJson(`/ayah/${surah}:${ayah}/${EN_EDITION}`),
          getJson(`/ayah/${surah}:${ayah}/${AR_EDITION}`)
        ]);
        await sock.sendMessage(chatJid, { text: formatAyah(ar, en) }, { quoted: mek });
        return;
      }

      if (ref.type === 'surah') {
        const { surah } = ref;
        if (surah < 1 || surah > 114) {
          return sock.sendMessage(chatJid, { text: '❌ Surah must be between 1 and 114.' }, { quoted: mek });
        }
        const [enSurah, arSurah] = await Promise.all([
          getJson(`/surah/${surah}/${EN_EDITION}`),
          getJson(`/surah/${surah}/${AR_EDITION}`)
        ]);
        const maxAyahs = enSurah.numberOfAyahs <= 20 ? enSurah.numberOfAyahs : 7;
        let out = `📖 *${enSurah.englishName}* (${enSurah.englishNameTranslation || SURAHS[surah]})\n`;
        out += `Surah *${surah}* • ${enSurah.revelationType} • ${enSurah.numberOfAyahs} ayahs`;
        if (enSurah.numberOfAyahs > maxAyahs) {
          out += `\n_Showing first ${maxAyahs} ayahs — use .quran ${surah}:N for a specific ayah_\n`;
        } else {
          out += '\n';
        }
        for (let i = 0; i < maxAyahs; i++) {
          const ar = arSurah.ayahs[i];
          const en = enSurah.ayahs[i];
          out += `\n*${surah}:${en.numberInSurah}*\n${ar.text}\n_${en.text}_\n`;
        }
        await sock.sendMessage(chatJid, { text: out.trim() }, { quoted: mek });
      }
    } catch (err) {
      console.error('Quran error:', err.message);
      const status = err.response?.status;
      await sock.sendMessage(chatJid, {
        text: status === 404
          ? '❌ Ayah not found. Check the Surah:Ayah reference (e.g. *.quran 2:255*).'
          : '❌ Could not reach the Qur\'an API. Try again shortly.'
      }, { quoted: mek });
    }
  },
  qur: async (args) => module.exports.quran(args),
  ayat: async (args) => module.exports.quran(args)
};
