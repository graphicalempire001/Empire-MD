import { useRef, useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, X, Send, ExternalLink } from 'lucide-react'
import {
  CREATOR_NAME,
  COMPANY,
  CEO_PAGE,
  WA_NUMBER,
  PREMIUM_PRICE,
  PREMIUM_PERIOD,
  CHANNEL_URL,
  findCommand,
  randomTestimonials,
} from './siteChatKnowledge'

/* ─── Identity ───────────────────────────────────────────────── */
const BOT_NAME = 'BOT-WAN'
const BOT_ROLE = 'Empire MD Customer Support'
const BRAND_LINE = `Built by ${COMPANY}`
const BOT_AVATAR = 'https://i.ibb.co/1YLKVVSy/FB-IMG-1786428497914.jpg'

type Role = 'bot' | 'user' | 'system'

interface Msg {
  id: string
  role: Role
  text: string
  ts: number
  waLink?: string
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

/* ─── Free AI supplement ─────────────────────────────────────── */
async function askAI(
  message: string,
  history: Msg[]
): Promise<{ reply: string; provider?: string } | null> {
  try {
    const res = await fetch('/api/botwan/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        history: history.slice(-8).map((m) => ({
          role: m.role === 'bot' ? 'assistant' : 'user',
          content: m.text.slice(0, 400),
        })),
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data?.success && data.reply) {
      return { reply: String(data.reply), provider: data.provider }
    }
  } catch (_) {
    /* offline / no key — local rules */
  }
  return null
}

/* ─── Typo helper ────────────────────────────────────────────── */
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

function hasWord(hay: string, needles: string[], maxDist = 1): boolean {
  const words = hay.toLowerCase().split(/[^a-z0-9.]+/).filter(Boolean)
  for (const n of needles) {
    const nl = n.toLowerCase()
    if (hay.includes(nl)) return true
    for (const w of words) {
      if (Math.abs(w.length - nl.length) > maxDist + 1) continue
      if (levenshtein(w, nl) <= maxDist) return true
    }
  }
  return false
}

/* ─── Intent detection ───────────────────────────────────────── */
type Intent =
  | 'greeting'
  | 'thanks'
  | 'bye'
  | 'who'
  | 'price'
  | 'premium_why'
  | 'pair'
  | 'how_use'
  | 'command_detail'
  | 'commands_list'
  | 'testimonial'
  | 'problem'
  | 'human'
  | 'status'
  | 'channel'
  | 'fallback'

function detectIntent(raw: string): { intent: Intent; commandName?: string } {
  const t = raw.toLowerCase().trim()
  if (!t) return { intent: 'fallback' }

  // 1. Greetings
  if (
    /^(hi|hii+|hello|hey|heyy+|good\s*(morning|afternoon|evening|day)|sup|yo|howdy|what's up|whats up|wetin dey|how far)\b/.test(t) ||
    t === 'hi' || t === 'hello' || t === 'hey' || t === 'how far'
  ) {
    return { intent: 'greeting' }
  }

  // 2. Thanks / Bye
  if (hasWord(t, ['thanks', 'thank', 'thx', 'ty', 'appreciate', 'grateful', 'thank you', 'thanks a lot'])) {
    return { intent: 'thanks' }
  }
  if (hasWord(t, ['bye', 'goodbye', 'later', 'see you', 'cya', 'i dey go', 'i go come'])) {
    return { intent: 'bye' }
  }

  // 3. HUMAN / LIVE AGENT (high priority)
  const humanTriggers = [
    'human', 'agent', 'staff', 'person', 'operator', 'representative',
    'real person', 'real human', 'live agent', 'live support', 'live person',
    'customer care', 'customer service', 'customer support', 'support team',
    'talk to human', 'talk to a human', 'talk to an agent', 'talk to someone',
    'speak to human', 'speak to a human', 'speak to an agent', 'speak to someone',
    'connect me', 'connect to human', 'connect to agent', 'connect to support',
    'transfer me', 'handover', 'hand over', 'escalate',
    'i want human', 'i need human', 'i want agent', 'i need agent',
    'i want a person', 'i need a person', 'real support',
    'chat with human', 'chat with agent', 'chat with someone',
    'abeg human', 'abeg agent', 'abeg person', 'abeg support',
    'give me human', 'give me agent', 'talk to person', 'talk to staff',
  ]
  if (
    hasWord(t, humanTriggers, 2) ||
    /(?:talk|speak|chat|connect|transfer|hand\s*over|escalate).{0,25}(?:human|agent|person|staff|support|someone|operator)/i.test(t) ||
    /(?:human|agent|person|staff|support|operator).{0,15}(?:please|abeg|now|asap|help)/i.test(t) ||
    /(?:i (?:want|need|prefer)|can i|let me).{0,20}(?:human|agent|person|staff|real)/i.test(t) ||
    t.includes('talk to a human')
  ) {
    return { intent: 'human' }
  }

  // 4. PAIRING / HOW TO CONNECT (high priority – before price)
  if (
    hasWord(t, [
      'pair', 'pairing', 'connect', 'link number', 'link my number',
      'how to start', 'how do i start', 'get bot', 'get a bot', 'get my bot',
      'deploy', 'setup', 'set up', 'how do i connect', 'how to connect',
      'how to pair', 'how do i pair', 'pairing code', 'scan qr', 'qr code',
      'how to get bot', 'how can i get', 'i want to pair', 'i want to connect',
      'connect bot', 'pair bot', 'pair my number', 'start bot', 'activate bot',
    ], 1) ||
    /how (?:to|do i|can i).{0,20}(?:pair|connect|link|get (?:a |my )?bot|start)/i.test(t) ||
    /(?:pair|connect|link).{0,15}(?:bot|number|whatsapp)/i.test(t)
  ) {
    // Only treat as price if they clearly ask about money AND are not asking for steps
    if (
      hasWord(t, ['how much', 'price', 'cost', 'naira', '₦', 'pay', 'payment']) &&
      !hasWord(t, ['how to', 'how do i', 'steps', 'guide', 'pair', 'connect'])
    ) {
      return { intent: 'price' }
    }
    return { intent: 'pair' }
  }

  // 5. Creator / Who built this
  if (
    hasWord(t, [
      'who created', 'who built', 'who made', 'creator', 'founder',
      'mishael', 'yakubu', 'empire digitals', 'who is behind', 'built by',
      'who own', 'who owns', 'who is the owner', 'who is ceo', 'ceo',
    ])
  ) {
    return { intent: 'who' }
  }

  // 6. Payment / subscription TROUBLE (before plain price)
  if (
    hasWord(t, ['payment', 'pay', 'subscribe', 'subscription', '₦', 'naira', 'premium']) &&
    hasWord(t, [
      'not working', 'broken', 'error', 'failed', 'fail', 'declined',
      'problem', 'issue', 'bug', 'stuck', "didn't go", 'did not go',
      "hasn't updated", 'has not updated', 'no update', "can't", 'cannot',
      'pending', 'not reflecting', 'still free', 'not upgraded',
    ])
  ) {
    return { intent: 'problem' }
  }

  // 7. Pricing
  if (
    hasWord(t, [
      'price', 'pricing', 'how much', 'cost', 'naira', '₦',
      'payment', 'pay', 'subscribe', 'subscription', 'premium price',
      'how much is premium', 'is it free', 'free plan',
    ])
  ) {
    return { intent: 'price' }
  }

  if (hasWord(t, ['why premium', 'why pay', 'is free enough', 'do i need premium', 'worth it', 'why should i pay'])) {
    return { intent: 'premium_why' }
  }

  // 8. Channel
  if (hasWord(t, ['channel', 'whatsapp channel', 'follow channel', 'official channel', 'join channel'])) {
    return { intent: 'channel' }
  }

  // 9. Testimonials / trust
  if (hasWord(t, ['testimonial', 'review', 'reviews', 'proof', 'is it good', 'recommend', 'trust', 'legit', 'scam'])) {
    return { intent: 'testimonial' }
  }

  // 10. Problems / not working
  if (
    hasWord(t, [
      'not working', 'broken', 'error', 'failed', 'problem', 'issue', 'bug',
      'down', 'offline', "can't", 'cannot', 'help me', 'not connecting',
      'bot offline', 'disconnected', 'session expired',
    ])
  ) {
    return { intent: 'problem' }
  }

  // 11. Specific command
  const cmd = findCommand(t)
  if (cmd) {
    if (
      hasWord(t, ['all commands', 'command list', 'list commands', 'what can', 'features', 'menu', 'help', 'show commands']) &&
      !hasWord(t, ['.' + cmd.name, cmd.name, ...cmd.aliases])
    ) {
      return { intent: 'commands_list' }
    }
    return { intent: 'command_detail', commandName: cmd.name }
  }

  // 12. General commands / features list
  if (
    hasWord(t, [
      'command', 'commands', 'feature', 'features', 'what can it do',
      'capabilities', 'menu', 'help', 'list', 'what does it do',
    ])
  ) {
    return { intent: 'commands_list' }
  }

  // 13. How to use (general)
  if (hasWord(t, ['how to use', 'how do i use', 'how does it work', 'usage', 'how to', 'guide'])) {
    return { intent: 'how_use' }
  }

  // 14. Status
  if (hasWord(t, ['status', 'online', 'alive', 'ping', 'are you there'])) {
    return { intent: 'status' }
  }

  return { intent: 'fallback' }
}

/* ─── Short natural replies ──────────────────────────────────── */
const GREETINGS = [
  `Hey 👋 I'm *${BOT_NAME}*, ${BOT_ROLE}.\n\nHow can I help you today?`,
  `Hi there! ${BOT_NAME} here — Empire MD support.\n\nWhat do you need? Pairing, pricing, a command, or something else?`,
  `Hello 👋 You're chatting with *${BOT_NAME}*.\n\nAsk me anything about Empire MD — I'll keep it short.`,
]

const THANKS = [
  `You're welcome 🙌 Anything else?`,
  `Anytime. Need help with something else?`,
  `Glad I could help. Ping me if you get stuck.`,
]

const BYE = [
  `Take care! Type anytime if you need Empire MD help.`,
  `Bye 👋 ${BOT_NAME} is here whenever you're back.`,
]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function replyFor(
  intent: Intent,
  raw: string,
  commandName?: string
): { text: string; offerHuman?: boolean; handoff?: boolean } {
  switch (intent) {
    case 'greeting':
      return { text: pick(GREETINGS) }

    case 'thanks':
      return { text: pick(THANKS) }

    case 'bye':
      return { text: pick(BYE) }

    case 'who':
      return {
        text:
          `Empire MD is built by *${COMPANY}*.\n` +
          `CEO: *${CREATOR_NAME}*.\n\n` +
          `More about him → ${CEO_PAGE}\n\n` +
          `I'm ${BOT_NAME}, the support assistant on this site.`,
      }

    case 'price':
      return {
        text:
          `*Free plan* — fully usable (media, stickers, groups, AI, etc.)\n\n` +
          `*Premium* — *${PREMIUM_PRICE}* for ${PREMIUM_PERIOD}\n` +
          `Unlocks: ghost mode, anti-delete in chat, .vv (view-once), .send, PDF/receipts, antibot and more.\n\n` +
          `You choose Free or Premium when you pair. You can also upgrade later with *.upgrade* inside WhatsApp.\n\n` +
          `Need help pairing first? Ask *how to pair*.`,
        offerHuman: true,
      }

    case 'premium_why':
      return {
        text:
          `Free is solid for everyday use.\n\n` +
          `Premium keeps the servers stable and unlocks privacy + business tools (ghost mode, anti-delete, docs, antibot).\n\n` +
          `Only pay if you need those — no pressure.`,
      }

    case 'pair':
      return {
        text:
          `Here's exactly how to pair your bot (takes \~1–2 minutes):\n\n` +
          `1️⃣ Tap the green *Get Your Free Bot* button on this website\n` +
          `2️⃣ Enter your WhatsApp number (with country code, e.g. 234…)\n` +
          `3️⃣ Give the bot a name\n` +
          `4️⃣ Choose Free or Premium\n` +
          `5️⃣ You will get an 8-digit pairing code\n` +
          `6️⃣ On your phone open WhatsApp → Linked Devices → Link a Device → Link with phone number instead → enter the code\n\n` +
          `Once it says connected, type *.help* or *.menu* in WhatsApp to see all commands.\n\n` +
          `Stuck at any step? Just say *human* and I’ll connect you to the team.`,
        offerHuman: true,
      }

    case 'how_use':
      return {
        text:
          `After you pair the bot:\n\n` +
          `• Open WhatsApp and message the bot (or any chat where it is present)\n` +
          `• Type *.help* or *.menu* to see the full command list\n` +
          `• Example: *.play Asake Lonely* or reply to a photo with *.s*\n\n` +
          `Want the pairing steps instead? Ask *how to pair*.`,
      }

    case 'command_detail': {
      const cmd = commandName ? findCommand(commandName) : findCommand(raw)
      if (!cmd) {
        return {
          text: `I couldn't match that to a command. Try the exact name (e.g. *.vv* or *play*) or type *commands* for a short list.`,
        }
      }
      const planTag = cmd.plan === 'premium' ? ' · *Premium*' : cmd.plan === 'owner' ? ' · *Owner*' : ''
      const aliasesText = cmd.aliases.length
        ? ` (${cmd.aliases.map((a) => '.' + a).join(', ')})`
        : ''
      let out =
        `*\( {cmd.name}* \){aliasesText}${planTag}\n\n` +
        `${cmd.short}\n\n` +
        `*Use:* ${cmd.usage}`
      if (cmd.tips) out += `\n\n💡 ${cmd.tips}`
      return { text: out }
    }

    case 'commands_list':
      return {
        text:
          `Here's the short version:\n\n` +
          `📥 Media — .s .play .ytmp3 .ytmp4 .ig .tt .fb .vv .send\n` +
          `👥 Groups — .kick .promote .tagall .antilink .greet\n` +
          `🤖 Utility — .ai .ping .help .afk\n` +
          `⚙️ Auto — .autostatusview .antidelete .anticall\n` +
          `👑 Owner — .setprefix .mode .broadcast\n` +
          `🧾 Business — .invoice .receipt .pdf .ocr (Premium)\n\n` +
          `Ask me about any one (e.g. "explain .vv") and I'll show usage only for that.`,
      }

    case 'testimonial':
      return {
        text: `What people say:\n\n${randomTestimonials(2)}\n\nWant more? Or ask about a feature.`,
      }

    case 'problem':
      return {
        text:
          `Sorry you're having trouble.\n\n` +
          `Quick checks:\n` +
          `• Bot still connected? Try *.ping*\n` +
          `• Payment went through but plan didn’t update?\n` +
          `• Pairing code expired? Request a new one from the website\n` +
          `• Session logged out? Just pair again\n\n` +
          `Tell me exactly what is happening (e.g. “pairing code not working” or “payment not reflecting”) or say *human* and I’ll hand you over with a summary.`,
        offerHuman: true,
      }

    case 'human':
      return {
        text:
          `Got it — I’ll connect you to a human on WhatsApp.\n\n` +
          `Tap the green button below to open the chat. Your conversation summary is ready for them.`,
        handoff: true,
      }

    case 'status':
      return {
        text: `I'm online and ready 🟢\n\nEmpire MD support via *${BOT_NAME}*. What do you need?`,
      }

    case 'channel':
      return {
        text: `Official channel:\n👉 ${CHANNEL_URL}\n\nGood place for updates and tips.`,
      }

    default:
      return {
        text:
          `I'm not 100% sure what you need yet.\n\n` +
          `I can help with:\n` +
          `• Pairing / connect\n` +
          `• Pricing (Premium ${PREMIUM_PRICE})\n` +
          `• Any command (just name it)\n` +
          `• Problems / human agent\n\n` +
          `Or say it another way — I'll try again.`,
        offerHuman: true,
      }
  }
}

/* ─── First-person handoff ───────────────────────────────────── */
function buildHandoffSummary(history: Msg[]): string {
  const userBits = history
    .filter((m) => m.role === 'user')
    .slice(-6)
    .map((m) => m.text.replace(/\*/g, '').trim())
    .filter(Boolean)

  const topics =
    userBits.length > 0
      ? userBits.map((t) => `• ${t.slice(0, 120)}`).join('\n')
      : '• (just opened chat)'

  return (
    `Hi Empire MD support 👋\n\n` +
    `I was chatting with *${BOT_NAME}* on the website and I'd like a human to take over.\n\n` +
    `Here's what I was asking about:\n${topics}\n\n` +
    `Please continue from here — thanks!`
  )
}

function buildWaUrl(history: Msg[]): string {
  return `https://wa.me/\( {WA_NUMBER}?text= \){encodeURIComponent(buildHandoffSummary(history))}`
}

const FAQ_CHIPS = [
  { label: 'How do I pair?', value: 'How do I pair?' },
  { label: 'Premium price', value: 'Premium price' },
  { label: 'How does .vv work?', value: 'How does .vv work?' },
  { label: 'Who built this?', value: 'Who built this?' },
  { label: 'Talk to a human', value: 'Talk to a human', forceHuman: true },
]

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
}

export default function WhatsAppChat({ open, onOpenChange }: Props) {
  const [text, setText] = useState('')
  const [messages, setMessages] = useState<Msg[]>([])
  const [typing, setTyping] = useState(false)
  const [pendingWa, setPendingWa] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([
        {
          id: uid(),
          role: 'bot',
          text:
            `👋 Hi — I'm *${BOT_NAME}*, ${BOT_ROLE}.\n\n` +
            `I help with pairing, plans, commands, and problems.\n` +
            `${BRAND_LINE}.\n\n` +
            `Ask me anything, or tap a quick question below.`,
          ts: Date.now(),
        },
      ])
    }
  }, [open, messages.length])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 200)
  }, [open])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, typing, pendingWa])

  const pushBot = useCallback((reply: string, extra?: Partial<Msg>) => {
    setMessages((prev) => [
      ...prev,
      { id: uid(), role: 'bot', text: reply, ts: Date.now(), ...extra },
    ])
  }, [])

  /** Open WhatsApp instantly — works better on mobile + desktop */
  const startHandoff = useCallback((history: Msg[]) => {
    const url = buildWaUrl(history)
    setPendingWa(url)

    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)

    if (isMobile) {
      window.location.href = url
      return
    }

    try {
      const w = window.open(url, '_blank', 'noopener,noreferrer')
      if (!w) {
        console.warn('Popup blocked — green button is available')
      }
    } catch (_) {
      /* ignore */
    }
  }, [])

  const respond = useCallback(
    async (raw: string, history: Msg[]) => {
      const { intent, commandName } = detectIntent(raw)

      // Human handoff — always local, always show WA button
      if (intent === 'human') {
        const result = replyFor('human', raw)
        pushBot(result.text)
        startHandoff([...history, { id: uid(), role: 'user', text: raw, ts: Date.now() }])
        return
      }

      // Strong local intents — never send to AI
      const strongLocal = [
        'greeting', 'thanks', 'bye', 'who', 'price', 'premium_why',
        'pair', 'how_use', 'command_detail', 'commands_list',
        'testimonial', 'channel', 'status', 'problem',
      ]

      if (strongLocal.includes(intent)) {
        const result = replyFor(intent, raw, commandName)
        pushBot(result.text)
        if (result.offerHuman) {
          setTimeout(() => {
            pushBot(
              `If you'd rather talk to a person, type *human* or tap *Talk to a human* — I'll open WhatsApp with a short summary.`
            )
          }, 900)
        }
        return
      }

      // Open questions → free AI (with local fallback)
      const ai = await askAI(raw, history)
      if (ai?.reply) {
        pushBot(ai.reply)
        return
      }

      const result = replyFor(intent, raw, commandName)
      pushBot(result.text)
      if (result.offerHuman) {
        setTimeout(() => {
          pushBot(
            `If you'd rather talk to a person, type *human* or tap *Talk to a human* — I'll open WhatsApp with a short summary.`
          )
        }, 900)
      }
    },
    [pushBot, startHandoff]
  )

  const send = (override?: string) => {
    const msg = (override ?? text).trim()
    if (!msg || typing) return
    const userMsg: Msg = { id: uid(), role: 'user', text: msg, ts: Date.now() }
    setMessages((prev) => [...prev, userMsg])
    setText('')
    setTyping(true)
    setPendingWa(null)
    const delay = 500 + Math.min(1200, msg.length * 16)
    setTimeout(() => {
      setTyping(false)
      respond(msg, [...messages, userMsg])
    }, delay)
  }

  return (
    <>
      <div className="sr-only">
        Empire MD customer support is BOT-WAN. Built by Empire Digitals. CEO Mishael Yakubu —{' '}
        {CEO_PAGE}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            className="fixed bottom-24 right-5 md:right-8 z-[90] w-[92vw] max-w-md rounded-2xl overflow-hidden shadow-2xl border border-[#d1e7dd] flex flex-col max-h-[min(72vh,580px)] bg-[#f0f2f5]"
          >
            {/* Header */}
            <div className="px-4 py-3 bg-[#00A884] text-white flex items-center gap-3 shrink-0 shadow-sm">
              <img
                src={BOT_AVATAR}
                alt={BOT_NAME}
                className="w-10 h-10 rounded-full object-cover border-2 border-white/40 bg-white"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.display = 'none'
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm leading-tight">{BOT_NAME}</div>
                <div className="text-[11px] text-white/90 truncate">{BOT_ROLE} · online</div>
              </div>
              <button
                onClick={() => onOpenChange(false)}
                className="p-1.5 rounded-full hover:bg-white/15 transition"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Messages */}
            <div
              ref={listRef}
              className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5"
              style={{
                backgroundColor: '#EFEAE2',
                backgroundImage:
                  'radial-gradient(circle at 20% 20%, rgba(0,168,132,0.04) 0%, transparent 50%)',
              }}
            >
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed whitespace-pre-wrap shadow-sm ${
                      m.role === 'user'
                        ? 'bg-[#D9FDD3] text-[#111b21] rounded-br-md'
                        : 'bg-white text-[#111b21] rounded-bl-md border border-black/[0.04]'
                    }`}
                  >
                    {m.text.split(/(\*[^*]+\*)/g).map((part, i) =>
                      part.startsWith('*') && part.endsWith('*') ? (
                        <strong key={i}>{part.slice(1, -1)}</strong>
                      ) : (
                        <span key={i}>{part}</span>
                      )
                    )}
                    <div
                      className={`text-[10px] mt-1 ${
                        m.role === 'user' ? 'text-[#667781]' : 'text-[#8696a0]'
                      }`}
                    >
                      {new Date(m.ts).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
              ))}

              {typing && (
                <div className="flex justify-start">
                  <div className="bg-white border border-black/[0.04] rounded-2xl rounded-bl-md px-4 py-2.5 text-[#667781] text-xs shadow-sm">
                    {BOT_NAME} is typing…
                  </div>
                </div>
              )}

              {/* Reliable WhatsApp open button */}
              {pendingWa && (
                <div className="flex justify-center pt-1 pb-2">
                  <a
                    href={pendingWa}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#25D366] text-white text-sm font-semibold shadow-md hover:bg-[#1ebe57] transition"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    Open WhatsApp with summary
                  </a>
                </div>
              )}
            </div>

            {/* Chips */}
            <div className="px-2 py-2 flex gap-1.5 overflow-x-auto bg-[#f0f2f5] border-t border-[#e9edef] shrink-0">
              {FAQ_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  onClick={() => {
                    if (chip.forceHuman) {
                      const userMsg: Msg = {
                        id: uid(),
                        role: 'user',
                        text: chip.value,
                        ts: Date.now(),
                      }
                      setMessages((prev) => [...prev, userMsg])
                      setTyping(true)
                      setPendingWa(null)
                      setTimeout(() => {
                        setTyping(false)
                        const result = replyFor('human', chip.value)
                        pushBot(result.text)
                        startHandoff([...messages, userMsg])
                      }, 400)
                    } else {
                      send(chip.value)
                    }
                  }}
                  className="shrink-0 px-3 py-1.5 rounded-full bg-white border border-[#e9edef] text-[12px] text-[#111b21] hover:bg-[#f0f2f5] transition whitespace-nowrap"
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Brand */}
            <a
              href={CEO_PAGE}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-white text-[10px] text-[#667781] flex items-center justify-center gap-1.5 hover:text-[#00A884] transition shrink-0 border-t border-[#e9edef]"
            >
              {BRAND_LINE}
              <ExternalLink size={10} />
            </a>

            {/* Input */}
            <div className="p-2 bg-[#f0f2f5] border-t border-[#e9edef] flex items-center gap-2 shrink-0">
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="Message BOT-WAN…"
                className="flex-1 bg-white border border-[#e9edef] rounded-full px-4 py-2.5 text-sm text-[#111b21] placeholder-[#8696a0] outline-none focus:border-[#00A884] transition"
              />
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => send()}
                disabled={!text.trim() || typing}
                className="w-10 h-10 rounded-full bg-[#00A884] flex items-center justify-center text-white shrink-0 disabled:opacity-50 shadow-sm"
                aria-label="Send"
              >
                <Send size={16} />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Launcher */}
      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => onOpenChange(!open)}
        className="fixed bottom-5 right-5 md:right-8 z-[95] w-14 h-14 rounded-full bg-[#00A884] flex items-center justify-center shadow-lg"
        aria-label="Open BOT-WAN support"
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.span
              key="x"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
            >
              <X size={24} className="text-white" />
            </motion.span>
          ) : (
            <motion.span
              key="c"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
            >
              <MessageCircle size={24} className="text-white" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </>
  )
}
