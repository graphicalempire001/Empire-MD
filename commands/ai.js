const axios = require('axios');
const { getAiMemory, saveAiMemory, updateSettings } = require('../lib/database');

const MAX_TURNS = 14;
const REQUEST_TIMEOUT = 45000;

const BASE_IDENTITY =
  "You are Empire AI, an artificial intelligence programmed and engineered by the software engineers at Empire Digital. " +
  "If asked who you are, who built you, what you are, or who made you, clearly and proudly state that you are an AI built by the software engineering team at Empire Digital. " +
  "You are intelligent, articulate, witty and genuinely helpful. You are strong at problem solving, reasoning, coding, explanations and natural conversation. " +
  "You remember the user's name and prior context. Adapt automatically to the user's language and dialect — always reply in the SAME language the user wrote in. " +
  "Keep replies chat-friendly (usually under 130 words) unless the user asks for depth. Never pretend to be a human.";

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

async function askLLM(messages) {
  const res = await axios.post(
    'https://text.pollinations.ai/openai',
    { model: 'openai', messages, temperature: 0.75 },
    { timeout: REQUEST_TIMEOUT, headers: { 'Content-Type': 'application/json' } }
  );
  const out = res.data?.choices?.[0]?.message?.content;
  if (out && out.trim()) return out.trim();
  throw new Error("Empty LLM response");
}

async function askFallback(prompt) {
  const res = await axios.get(
    `https://text.pollinations.ai/${encodeURIComponent(prompt)}`,
    { timeout: REQUEST_TIMEOUT }
  );
  if (typeof res.data === 'string' && res.data.trim()) return res.data.trim();
  throw new Error("Empty fallback response");
}

// Core engine — reused by the .ai command AND by mention/swipe/aggressive triggers.
async function runAi({ sock, chatJid, mek, text, senderName, sender, settings }) {
  const sessionId = sock.sessionId || 'default';
  const userJid = sender || mek.key.participant || chatJid;
  const persona = settings?.aipersona || sock.botSettings?.aipersona || "";

  const mem = await getAiMemory(sessionId, userJid);
  let name = mem.display_name || senderName || null;
  const found = detectName(text);
  if (found) name = found;

  const history = Array.isArray(mem.history) ? mem.history : [];
  const messages = [
    { role: 'system', content: buildSystemPrompt(name, persona) },
    ...history.slice(-MAX_TURNS),
    { role: 'user', content: text }
  ];

  let reply;
  try {
    reply = await askLLM(messages);
  } catch (e) {
    const ctx = name ? `User's name is ${name}. ` : '';
    reply = await askFallback(`${buildSystemPrompt(name, persona)}
${ctx}User: ${text}
Empire AI:`);
  }

  history.push({ role: 'user', content: text });
  history.push({ role: 'assistant', content: reply });
  await saveAiMemory(sessionId, userJid, name, history.slice(-MAX_TURNS * 2));

  await sock.sendMessage(chatJid, { text: `🤖 *Empire AI:* ${reply}` }, { quoted: mek });
  return reply;
}

module.exports = {
  runAi, // exported for msgHandler auto-triggers (mention / swipe / aggressive)

  ai: async ({ sock, chatJid, mek, text, senderName, sender, isOwner, settings }) => {
    const arg = (text || "").trim();

    // ── .ai mode <off|reply|aggressive> (owner-only) ──
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

    // ── .ai teach <instruction> (owner trains persona/behaviour) ──
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

    // ── .ai persona (view learned instructions) ──
    if (/^persona$/i.test(arg)) {
      const p = settings?.aipersona || "(none set)";
      return sock.sendMessage(chatJid, { text: `🎭 *Current AI instructions:*
${p}` }, { quoted: mek });
    }

    // ── .ai forget (wipe learned persona) ──
    if (/^forget$/i.test(arg)) {
      if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ Only the owner can reset the AI persona." }, { quoted: mek });
      if (sock.sessionId) await updateSettings(sock.sessionId, { aipersona: "" });
      sock.botSettings = { ...(settings || {}), aipersona: "" };
      return sock.sendMessage(chatJid, { text: "🧽 *Persona cleared.* Back to default behaviour." }, { quoted: mek });
    }

    // ── .ai reset (wipe this user's conversation memory) ──
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

    await sock.sendMessage(chatJid, { text: "🧠 *Empire AI is thinking...*" }, { quoted: mek });
    try {
      await runAi({ sock, chatJid, mek, text: arg, senderName, sender, settings });
    } catch (err) {
      console.error("AI error:", err.message);
      await sock.sendMessage(chatJid, { text: "🤖 *Empire AI:* My servers are briefly overloaded — try again in a moment." }, { quoted: mek });
    }
  },
  chat: async (args) => module.exports.ai(args),
  ask: async (args) => module.exports.ai(args)
};
