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
  formatCommandReply,
  listCommandsByCategory,
  randomTestimonials,
} from './siteChatKnowledge'

/* ─── Identity ───────────────────────────────────────────────── */
const BOT_NAME = 'BOT-WAN'
const BOT_ROLE = 'Empire MD Customer Support'
const BRAND_LINE = `Built by ${COMPANY}`

type Role = 'bot' | 'user' | 'system'

interface Msg {
  id: string
  role: Role
  text: string
  ts: number
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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

/* ─── Intent detection (short → natural) ─────────────────────── */
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

  // Greetings first — never dump commands on "hi"
  if (
    /^(hi|hii+|hello|hey|heyy+|good\s*(morning|afternoon|evening|day)|sup|yo|howdy|what's up|whats up)\b/.test(t) ||
    t === 'hi' ||
    t === 'hello' ||
    t === 'hey'
  ) {
    return { intent: 'greeting' }
  }

  if (hasWord(t, ['thanks', 'thank', 'thx', 'ty', 'appreciate', 'grateful'])) {
    return { intent: 'thanks' }
  }

  if (hasWord(t, ['bye', 'goodbye', 'later', 'see you', 'cya'])) {
    return { intent: 'bye' }
  }

  if (
    hasWord(t, ['human', 'agent', 'support', 'staff', 'person', 'real person', 'talk to someone', 'customer care']) ||
    /speak to (a )?(human|person|agent)/.test(t)
  ) {
    return { intent: 'human' }
  }

  if (
    hasWord(t, ['who created', 'who built', 'who made', 'creator', 'founder', 'mishael', 'yakubu', 'empire digitals', 'who is behind', 'built by', 'who own', 'who owns'])
  ) {
    return { intent: 'who' }
  }

  if (hasWord(t, ['price', 'pricing', 'how much', 'cost', 'naira', '₦', 'payment', 'pay', 'subscribe', 'subscription'])) {
    return { intent: 'price' }
  }

  if (hasWord(t, ['why premium', 'why pay', 'is free enough', 'do i need premium', 'worth it'])) {
    return { intent: 'premium_why' }
  }

  if (
    hasWord(t, ['pair', 'pairing', 'connect', 'link number', 'how to start', 'get bot', 'deploy', 'setup', 'set up', 'how do i connect'])
  ) {
    return { intent: 'pair' }
  }

  if (hasWord(t, ['testimonial', 'review', 'reviews', 'proof', 'is it good', 'recommend', 'trust'])) {
    return { intent: 'testimonial' }
  }

  if (hasWord(t, ['channel', 'whatsapp channel', 'follow channel', 'official channel'])) {
    return { intent: 'channel' }
  }

  if (
    hasWord(t, ['not working', 'broken', 'error', 'failed', 'problem', 'issue', 'bug', 'down', 'offline', 'can\'t', 'cannot', 'help me'])
  ) {
    return { intent: 'problem' }
  }

  // Specific command?
  const cmd = findCommand(t)
  if (cmd) {
    // User asking "what commands" vs "how does .vv work"
    if (
      hasWord(t, ['all commands', 'command list', 'list commands', 'what can', 'features', 'menu', 'help']) &&
      !hasWord(t, ['.' + cmd.name, cmd.name, ...cmd.aliases])
    ) {
      return { intent: 'commands_list' }
    }
    return { intent: 'command_detail', commandName: cmd.name }
  }

  if (hasWord(t, ['command', 'commands', 'feature', 'features', 'what can it do', 'capabilities', 'menu', 'help', 'list'])) {
    return { intent: 'commands_list' }
  }

  if (hasWord(t, ['how to use', 'how do i use', 'how does it work', 'usage', 'how to'])) {
    return { intent: 'how_use' }
  }

  if (hasWord(t, ['status', 'online', 'alive', 'ping'])) {
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

function replyFor(intent: Intent, raw: string, commandName?: string): { text: string; offerHuman?: boolean; handoff?: boolean } {
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
          `*Premium* is *${PREMIUM_PRICE}* for ${PREMIUM_PERIOD}.\n\n` +
          `Free plan is available too — Premium unlocks ghost mode, anti-delete chat, .vv, .send, PDF/receipts, and antibot.\n\n` +
          `You can choose Free or Premium when you pair, or upgrade later with *.upgrade* on WhatsApp.`,
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
          `Quick start:\n` +
          `1. Tap *Get Bot* on this site\n` +
          `2. Enter your number + a bot name\n` +
          `3. Choose Free or Premium\n` +
          `4. Enter the pairing code in WhatsApp\n\n` +
          `Usually under 2 minutes. Stuck? Say *human* and I'll connect you.`,
        offerHuman: true,
      }

    case 'how_use':
      return {
        text:
          `After pairing, open WhatsApp and type *.help* (or *.menu*).\n\n` +
          `That's the full menu. Or ask me about a specific command — e.g. "how does .play work".`,
      }

    case 'command_detail': {
      const cmd = commandName ? findCommand(commandName) : findCommand(raw)
      if (!cmd) {
        return {
          text: `I couldn't match that to a command. Try the exact name (e.g. *.vv* or *play*) or type *commands* for a short list.`,
        }
      }
      // Keep it tight — not a wall of text
      const planTag = cmd.plan === 'premium' ? ' · *Premium*' : cmd.plan === 'owner' ? ' · *Owner*' : ''
      let out =
        `*${cmd.name}*${cmd.aliases.length ? ` (${cmd.aliases.map((a) => '.' + a).join(', ')})` : ''}${planTag}\n\n` +
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
          `Sorry you're hitting a snag.\n\n` +
          `Quick checks:\n` +
          `• Is the bot still connected? (try *.ping*)\n` +
          `• Did payment go through but plan didn't update?\n` +
          `• Pairing code expired? Request a new one.\n\n` +
          `Tell me what exactly failed, or say *human* and I'll pass you to the team with a summary.`,
        offerHuman: true,
      }

    case 'human':
      return {
        text:
          `Got it — connecting you to a human on WhatsApp.\n\n` +
          `I'll open a chat with a short note of what we talked about so they don't start from zero.`,
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

/* ─── First-person handoff (customer voice) ──────────────────── */
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

/* ─── FAQ chips (short) ──────────────────────────────────────── */
const FAQ_CHIPS = [
  'How do I pair?',
  'Premium price',
  'How does .vv work?',
  'Who built this?',
  'Talk to a human',
]

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
}

export default function WhatsAppChat({ open, onOpenChange }: Props) {
  const [text, setText] = useState('')
  const [messages, setMessages] = useState<Msg[]>([])
  const [typing, setTyping] = useState(false)
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
  }, [messages, typing])

  const pushBot = useCallback((reply: string) => {
    setMessages((prev) => [...prev, { id: uid(), role: 'bot', text: reply, ts: Date.now() }])
  }, [])

  const openHumanWhatsApp = useCallback((history: Msg[]) => {
    const summary = buildHandoffSummary(history)
    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(summary)}`, '_blank')
  }, [])

  const respond = useCallback(
    (raw: string, history: Msg[]) => {
      const { intent, commandName } = detectIntent(raw)
      const result = replyFor(intent, raw, commandName)

      pushBot(result.text)

      if (result.handoff) {
        setTimeout(() => openHumanWhatsApp([...history, { id: uid(), role: 'user', text: raw, ts: Date.now() }]), 700)
        return
      }

      if (result.offerHuman) {
        setTimeout(() => {
          pushBot(`If you'd rather talk to a person, type *human* — I'll open WhatsApp with a short summary of this chat.`)
        }, 900)
      }
    },
    [pushBot, openHumanWhatsApp]
  )

  const send = (override?: string) => {
    const msg = (override ?? text).trim()
    if (!msg || typing) return
    const userMsg: Msg = { id: uid(), role: 'user', text: msg, ts: Date.now() }
    setMessages((prev) => [...prev, userMsg])
    setText('')
    setTyping(true)
    // Natural typing delay — short for short messages
    const delay = 600 + Math.min(1400, msg.length * 18)
    setTimeout(() => {
      setTyping(false)
      respond(msg, [...messages, userMsg])
    }, delay)
  }

  return (
    <>
      {/* Light SEO / brand mention */}
      <div className="sr-only">
        Empire MD customer support is BOT-WAN. Built by Empire Digitals. CEO Mishael Yakubu — {CEO_PAGE}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            className="fixed bottom-24 right-5 md:right-8 z-[90] w-[92vw] max-w-md rounded-2xl overflow-hidden shadow-2xl glass border border-white/10 flex flex-col max-h-[min(70vh,560px)]"
          >
            {/* Header */}
            <div className="px-4 py-3 bg-[#075E54] text-white flex items-center gap-3 shrink-0">
              <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center text-lg font-bold border border-white/20">
                BW
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm leading-tight">{BOT_NAME}</div>
                <div className="text-[11px] text-white/75 truncate">{BOT_ROLE} · online</div>
              </div>
              <button
                onClick={() => onOpenChange(false)}
                className="p-1.5 rounded-full hover:bg-white/10 transition"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Messages */}
            <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 bg-[#0b141a]">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-[#005c4b] text-white rounded-br-md'
                        : 'bg-[#1f2c34] text-[#e9edef] rounded-bl-md'
                    }`}
                  >
                    {m.text.split(/(\*[^*]+\*)/g).map((part, i) =>
                      part.startsWith('*') && part.endsWith('*') ? (
                        <strong key={i}>{part.slice(1, -1)}</strong>
                      ) : (
                        <span key={i}>{part}</span>
                      )
                    )}
                    <div className={`text-[10px] mt-1 ${m.role === 'user' ? 'text-white/50' : 'text-white/40'}`}>
                      {new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}

              {typing && (
                <div className="flex justify-start">
                  <div className="bg-[#1f2c34] rounded-2xl rounded-bl-md px-4 py-2.5 text-white/60 text-xs">
                    {BOT_NAME} is typing…
                  </div>
                </div>
              )}
            </div>

            {/* Chips */}
            <div className="px-2 py-2 flex gap-1.5 overflow-x-auto bg-[#0b141a] border-t border-white/5 shrink-0 no-scrollbar">
              {FAQ_CHIPS.map((chip) => (
                <button
                  key={chip}
                  onClick={() => send(chip)}
                  className="shrink-0 text-[11px] px-3 py-1.5 rounded-full bg-[#1f2c34] text-[#e9edef] border border-white/10 hover:bg-[#2a3942] transition"
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Brand strip */}
            <a
              href={CEO_PAGE}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-[#0d1117] text-[10px] text-white/70 flex items-center justify-center gap-1.5 hover:text-white transition shrink-0"
            >
              {BRAND_LINE}
              <ExternalLink size={10} />
            </a>

            {/* Input */}
            <div className="p-2 bg-[#1f2c34] border-t border-white/5 flex items-center gap-2 shrink-0">
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="Message BOT-WAN…"
                className="flex-1 bg-[#2a3942] border border-white/10 rounded-full px-4 py-2.5 text-sm text-white placeholder-white/40 outline-none focus:border-[#00A884] transition"
              />
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => send()}
                disabled={!text.trim() || typing}
                className="w-10 h-10 rounded-full bg-[#00A884] flex items-center justify-center text-white shrink-0 disabled:opacity-50"
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
            <motion.span key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
              <X size={24} className="text-white" />
            </motion.span>
          ) : (
            <motion.span key="c" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}>
              <MessageCircle size={24} className="text-white" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </>
  )
}
