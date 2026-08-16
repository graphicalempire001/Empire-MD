// ─────────────────────────────────────────────
// Real web photo search (Bing + DuckDuckGo)
// No AI generation — only public search results
// ─────────────────────────────────────────────

const AI_BLOCK = [
  'pollinations', 'openai', 'midjourney', 'stable-diffusion',
  'leonardo.ai', 'nightcafe', 'civitai', 'tensor.art',
  'generated.photos', 'thispersondoesnotexist', 'artbreeder',
  'lexica.art', 'playgroundai', 'imagine.art'
];

function isBlocked(url = '') {
  const u = url.toLowerCase();
  return AI_BLOCK.some(b => u.includes(b));
}

async function searchBingPhotos(query, limit = 20) {
  const res = await axios.get('https://www.bing.com/images/async', {
    params: {
      q: query,
      first: 1,
      count: 35,
      mmasync: 1,
      qft: '+filterui:photo-photo+filterui:imagesize-large', // photos + large
    },
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    timeout: 15000,
  });

  const html = String(res.data);
  const out = [];
  const re = /m="({[^"]+})"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const raw = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
      const obj = JSON.parse(raw);
      const url = obj.murl || obj.imgurl;
      const w = parseInt(obj.w || 0, 10);
      const h = parseInt(obj.h || 0, 10);
      if (!url || !/^https?:\/\//i.test(url)) continue;
      if (isBlocked(url) || isBlocked(obj.purl || '')) continue;
      if (w < 600 || h < 400) continue; // only decent-sized real photos
      out.push({ url, title: obj.t || query, w, h, source: 'bing' });
    } catch (_) {}
  }
  return out.slice(0, limit);
}

async function searchDdgPhotos(query, limit = 15) {
  try {
    const home = await axios.get('https://duckduckgo.com/', {
      params: { q: query },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
      timeout: 12000,
    });
    const vqdMatch = String(home.data).match(/vqd=["']([^"']+)["']/i);
    if (!vqdMatch) return [];

    const imgRes = await axios.get('https://duckduckgo.com/i.js', {
      params: {
        l: 'us-en',
        o: 'json',
        q: query,
        vqd: vqdMatch[1],
        f: ',,,',
        p: '1',
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Referer: 'https://duckduckgo.com/',
      },
      timeout: 15000,
    });

    return (imgRes.data?.results || [])
      .filter(r => r.image && /^https?:\/\//i.test(r.image))
      .filter(r => !isBlocked(r.image) && !isBlocked(r.url || ''))
      .filter(r => (r.width || 0) >= 500 && (r.height || 0) >= 350)
      .slice(0, limit)
      .map(r => ({
        url: r.image,
        title: r.title || query,
        w: r.width || 0,
        h: r.height || 0,
        source: 'ddg',
      }));
  } catch {
    return [];
  }
}

async function searchRealPhotos(query) {
  const [bing, ddg] = await Promise.all([
    searchBingPhotos(query, 20).catch(() => []),
    searchDdgPhotos(query, 15).catch(() => []),
  ]);

  const seen = new Set();
  const merged = [];
  for (const item of [...bing, ...ddg]) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    merged.push(item);
  }
  // prefer larger images first
  merged.sort((a, b) => (b.w * b.h) - (a.w * a.h));
  if (!merged.length) throw new Error('No real photos found for that search');
  return merged;
}

async function downloadImage(url) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 20000,
    maxContentLength: 15 * 1024 * 1024,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
      Referer: 'https://www.bing.com/',
    },
    validateStatus: s => s >= 200 && s < 400,
  });
  const buf = Buffer.from(res.data);
  if (buf.length < 8000) throw new Error('file too small');
  return buf;
}

// Replace the imagine command with this:
imagine: async ({ sock, chatJid, mek, text }) => {
  if (!text || !text.trim()) {
    return sock.sendMessage(chatJid, {
      text: '❌ Search for *real photos* online.\n\nExample:\n*.imagine lagos skyline*\n*.img messi 2022*\n*.pics abuja national mosque*'
    }, { quoted: mek });
  }

  const query = text.trim().slice(0, 180);
  const TARGET = 3;

  try {
    await sock.sendMessage(chatJid, {
      text: `🔍 Searching the web for real photos: *${query}*\nSending ${TARGET} images…`
    }, { quoted: mek });

    const candidates = await searchRealPhotos(query);
    let sent = 0;

    for (const item of candidates) {
      if (sent >= TARGET) break;
      try {
        const buf = await downloadImage(item.url);
        await sock.sendMessage(chatJid, {
          image: buf,
          caption: sent === 0
            ? `📷 *\( {item.title}*\n_ \){item.w}×${item.h} • real web photo • \( {sent + 1}/ \){TARGET}_`
            : `📷 \( {sent + 1}/ \){TARGET} • real web photo`
        }, { quoted: mek });
        sent++;
        await new Promise(r => setTimeout(r, 800));
      } catch (e) {
        console.warn('Skip image:', e.message);
      }
    }

    if (sent === 0) {
      await sock.sendMessage(chatJid, {
        text: '❌ Found links but none downloaded. Try a more specific search (e.g. “lagos island aerial photo”).'
      }, { quoted: mek });
    } else if (sent < TARGET) {
      await sock.sendMessage(chatJid, {
        text: `⚠️ Only ${sent} working real photo(s) for that search.`
      }, { quoted: mek });
    }
  } catch (err) {
    console.error('Image search error:', err.message);
    await sock.sendMessage(chatJid, {
      text: `❌ Search failed: ${err.message}`
    }, { quoted: mek });
  }
},
