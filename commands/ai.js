const axios = require('axios');
const { getAiMemory, saveAiMemory, updateSettings } = require('../lib/database');

const MAX_TURNS = 14;
const REQUEST_TIMEOUT = 35000;

// 🔒 Hardcoded, model-proof identity answer.
const IDENTITY_ANSWER =
  "I am Empire AI — an artificial intelligence programmed and engineered by the software engineers at Empire Digitals.";

const IDENTITY_REGEX = new RegExp(
  "(who|what|whose|which company)\\s+(are|is|made|built|created|programmed|developed|designed|owns|invented)\\s+(you|u|your(?:\\s+(?:creator|developer|maker|owner|company))?)" +
  "|who\\s+(made|built|created|programmed|developed|designed|owns|invented)\\s+(you|u)" +
  "|are\\s+you\\s+(chatgpt|gpt|openai|gemini|bard|claude|llama|an?\\s+ai|a\\s+bot|a\\s+robot)" +
  "|what\\s+(ai|model|llm)\\s+are\\s+you" +
  "|who\\s+(developed|owns)\\s+you" +
  "|introduce\\s+yourself" +
  "|ta\\s+ni\\s+iwo|ta\\s+lo\\s+da\\s+e" +
  "|wer\\s+hat\\s+dich\\s+(gemacht|erstellt)" +
  "|qui\\s+t'?a\\s+(cr[ée]{2}|fabriqu[ée])",
  "i"
);

const BASE_IDENTITY =
  "You are Empire AI, an artificial intelligence programmed and engineered by the software engineers at Empire Digitals. " +
  "If asked who you are, who built you, what you are, or who made you, clearly and proudly state that you are an AI built by the software engineering team at Empire Digitals. " +
  "You are intelligent, articulate, witty and genuinely helpful. You are strong at problem solving, reasoning, coding, explanations and natural conversation. " +
  "You remember the user's name and prior context. Adapt automatically to the user's language and dialect — always reply in the SAME language the user wrote in. " +
  "Keep replies chat-friendly (usually under 130 words) unless the user asks for depth. try to be a human as human as possible..";

function buildSystemPrompt(name, persona) {
  let sys = BASE_IDENTITY;
  if (persona && persona.trim()) {
    sys += ` Additional behaviour instructions set by your owner (follow these unless they conflict with your core identity): ${persona.trim()}`;
  }
  if (name) sys += ` The user's name is ${name}; address them naturally.`;
  return sys;
}

function detectName(text) {
  const m = text.match(/\b(?:my name is|i am|i'm|im|call me|naa|orukọ mi ni)\s+([A-Za-z][A-Za-z .'-]{1,25})/i);
  if (!m) return null;
  return m[1].trim().split(/\s+/).slice(0, 2).join(' ').replace(/[.'-]+$/, '').trim() || null;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function extractContent(data) {
  if (!data) return null;
  if (typeof data === 'string' && data.trim()) return data.trim();
  const c = data?.choices?.[0]?.message?.content
    || data?.choices?.[0]?.text
    || data?.message?.content
    || data?.result
    || data?.response
    || data?.reply
    || data?.data?.response
    || data?.data?.message
    || data?.data?.content
    || data?.output
    || data?.text;
  if (typeof c === 'string' && c.trim()) return c.trim();
  return null;
}

// ── Provider 1: Optional OpenAI-compatible key (Groq / OpenRouter / etc.) ──
async function providerOpenAiCompat(messages) {
  if (!process.env.AI_API_KEY) throw new Error("No AI_API_KEY");
  const base = (process.env.AI_API_BASE || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
  const model = process.env.AI_MODEL || 'llama-3.1-8b-instant';
  const res = await axios.post(
    `${base}/chat/completions`,
    { model, messages, temperature: 0.75, max_tokens: 800 },
    {
      timeout: REQUEST_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.AI_API_KEY}`
      }
    }
  );
  const out = extractContent(res.data);
  if (out) return out;
  throw new Error("OpenAI-compat empty");
}

// ── Provider 2: Pollinations chat (keyless, anonymous still works) ──
async function providerPollinationsChat(messages, model = 'openai') {
  const res = await axios.post(
    'https://text.pollinations.ai/openai',
    { model, messages, temperature: 0.75 },
    {
      timeout: REQUEST_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 EmpireMD/1.0'
      },
      validateStatus: (s) => s < 500
    }
  );
  if (res.status === 402 || res.status === 429) {
    throw new Error(`Pollinations ${res.status}`);
  }
  const out = extractContent(res.data);
  if (out) return out;
  throw new Error("Pollinations chat empty");
}

// ── Provider 3: Pollinations simple GET (no auth) ──
async function providerPollinationsGet(messages) {
  // Keep prompt short so URL stays under limits
  const lastUser = [...messages].reverse().find(m => m.role === 'user')?.content || '';
  const sys = messages.find(m => m.role === 'system')?.content || '';
  const shortSys = sys.slice(0, 280);
  const prompt = `${shortSys}\n\nUser: ${lastUser}\nEmpire AI:`;
  const res = await axios.get(
    `https://text.pollinations.ai/${encodeURIComponent(prompt)}`,
    {
      timeout: REQUEST_TIMEOUT,
      headers: { 'User-Agent': 'Mozilla/5.0 EmpireMD/1.0' },
      responseType: 'text',
      transformResponse: [(d) => d]
    }
  );
  const raw = typeof res.data === 'string' ? res.data : String(res.data || '');
  if (raw.trim()) return raw.trim();
  throw new Error("Pollinations GET empty");
}

// ── Provider 4: Pollinations with alternate model name ──
async function providerPollinationsAlt(messages) {
  return providerPollinationsChat(messages, 'openai-fast');
}

// 🔁 Cascade providers. Optional paid key first, then keyless chain.
async function askAI(messages) {
  const providers = [
    { name: 'openai-compat', fn: providerOpenAiCompat },
    { name: 'pollinations-chat', fn: () => providerPollinationsChat(messages, 'openai') },
    { name: 'pollinations-alt', fn: () => providerPollinationsAlt(messages) },
    { name: 'pollinations-get', fn: () => providerPollinationsGet(messages) }
  ];

  let lastErr;
  for (const { name, fn } of providers) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const out = await fn(messages);
        if (out && out.trim()) return out.trim();
        throw new Error(`${name} empty`);
      } catch (e) {
        lastErr = e;
        const msg = (e.response?.status ? `${e.response.status} ` : '') + (e.message || '');
        console.error(`[AI] ${name} attempt ${attempt + 1} failed:`, msg);
        // Don't retry hard auth / budget errors on same provider
        const status = e.response?.status;
        if (status === 401 || status === 402 || status === 403) break;
        if (attempt === 0) await sleep(600 + Math.random() * 400);
      }
    }
  }
  throw lastErr || new Error("All AI providers failed");
}

// Core engine — reused by the .ai command AND by mention/swipe/aggressive triggers.
async function runAi({ sock, chatJid, mek, text, senderName, sender, settings }) {
  const sessionId = sock.sessionId || 'default';
  const userJid = sender || mek.key.participant || chatJid;
  const persona = settings?.aipersona || sock.botSettings?.aipersona || "";

  try { await sock.sendPresenceUpdate('composing', chatJid); } catch (_) {}

  const mem = await getAiMemory(sessionId, userJid);
  let name = mem.display_name || senderName || null;
  const found = detectName(text);
  if (found) name = found;

  const history = Array.isArray(mem.history) ? mem.history : [];

  // 🔒 HARDCODED IDENTITY INTERCEPT — bypasses the model entirely.
  if (IDENTITY_REGEX.test(text.trim())) {
    history.push({ role: 'user', content: text });
    history.push({ role: 'assistant', content: IDENTITY_ANSWER });
    await saveAiMemory(sessionId, userJid, name, history.slice(-MAX_TURNS * 2));
    try { await sock.sendPresenceUpdate('paused', chatJid); } catch (_) {}
    await sock.sendMessage(chatJid, { text: `🤖 *Empire AI:* ${IDENTITY_ANSWER}` }, { quoted: mek });
    return IDENTITY_ANSWER;
  }

  const messages = [
    { role: 'system', content: buildSystemPrompt(name, persona) },
    ...history.slice(-MAX_TURNS),
    { role: 'user', content: text }
  ];

  const reply = await askAI(messages);

  history.push({ role: 'user', content: text });
  history.push({ role: 'assistant', content: reply });
  await saveAiMemory(sessionId, userJid, name, history.slice(-MAX_TURNS * 2));

  try { await sock.sendPresenceUpdate('paused', chatJid); } catch (_) {}
  await sock.sendMessage(chatJid, { text: `🤖 *Empire AI:* ${reply}` }, { quoted: mek });
  return reply;
}

module.exports = {
  runAi,

  ai: async ({ sock, chatJid, mek, text, senderName, sender, isOwner, settings }) => {
    const arg = (text || "").trim();

    if (/^mode\b/i.test(arg)) {
      if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ Only the owner can change AI mode." }, { quoted: mek });
      const m = arg.split(/\s+/)[1]?.toLowerCase();
      if (!['off', 'reply', 'aggressive'].includes(m)) {
        return sock.sendMessage(chatJid, {
          text: `🧠 *AI Modes* (current: *${(settings?.aichatmode || 'off').toUpperCase()}*)

• *.ai mode off* — command only
• *.ai mode reply* — answer mentions & swipe-replies (DM + group)
• *.ai mode aggressive* — answer all DMs; mention/swipe-reply in groups`
        }, { quoted: mek });
      }
      if (sock.sessionId) await updateSettings(sock.sessionId, { aichatmode: m });
      sock.botSettings = { ...(settings || {}), aichatmode: m };
      return sock.sendMessage(chatJid, { text: `✅ AI conversation mode set to *${m.toUpperCase()}*.` }, { quoted: mek });
    }

    if (/^teach\b/i.test(arg)) {
      if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ Only the owner can teach the AI." }, { quoted: mek });
      const lesson = arg.replace(/^teach\s*/i, '').trim();
      if (!lesson) {
        return sock.sendMessage(chatJid, {
          text: `🎓 *Teach the AI how to behave.*
Example: *.ai teach Always greet Empire customers warmly and promote our channel.*

• *.ai persona* — view current instructions
• *.ai forget* — wipe learned instructions`
        }, { quoted: mek });
      }
      const existing = settings?.aipersona || "";
      const merged = existing ? `${existing} ${lesson}` : lesson;
      if (sock.sessionId) await updateSettings(sock.sessionId, { aipersona: merged });
      sock.botSettings = { ...(settings || {}), aipersona: merged };
      return sock.sendMessage(chatJid, { text: "✅ *Learned.* I'll apply that from now on." }, { quoted: mek });
    }

    if (/^persona$/i.test(arg)) {
      const p = settings?.aipersona || "(none set)";
      return sock.sendMessage(chatJid, { text: `🎭 *Current AI instructions:*
${p}` }, { quoted: mek });
    }

    if (/^forget$/i.test(arg)) {
      if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ Only the owner can reset the AI persona." }, { quoted: mek });
      if (sock.sessionId) await updateSettings(sock.sessionId, { aipersona: "" });
      sock.botSettings = { ...(settings || {}), aipersona: "" };
      return sock.sendMessage(chatJid, { text: "🧽 *Persona cleared.* Back to default behaviour." }, { quoted: mek });
    }

    if (/^reset$/i.test(arg)) {
      const uid = sender || mek.key.participant || chatJid;
      await saveAiMemory(sock.sessionId || 'default', uid, null, []);
      return sock.sendMessage(chatJid, { text: "🧹 *Memory cleared.* Fresh start." }, { quoted: mek });
    }

    if (!arg) {
      return sock.sendMessage(chatJid, {
        text: `❌ Ask me anything! e.g. *.ai explain black holes simply*

• *.ai reset* — clear our memory
• *.ai mode* — view/set conversation modes
• *.ai teach ...* — train my behaviour (owner)`
      }, { quoted: mek });
    }

    try {
      await runAi({ sock, chatJid, mek, text: arg, senderName, sender, settings });
    } catch (err) {
      console.error("AI error:", err.message);
      await sock.sendMessage(chatJid, {
        text: "🤖 *Empire AI:* My free reasoning engine is busy right now. Try again in a few seconds" +
          (process.env.AI_API_KEY ? "." : " — or set *AI_API_KEY* (e.g. free Groq key) for a more stable engine.")
      }, { quoted: mek });
    }
  },
  chat: async (args) => module.exports.ai(args),
  ask: async (args) => module.exports.ai(args)
};
