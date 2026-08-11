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
  DEPLOY_GUIDE,
  PREMIUM_EXPLAIN,
  CREATOR_BLURB,
  COMMANDS,
  findCommand,
  formatCommandReply,
  listCommandsByCategory,
  randomTestimonials,
  type CommandDoc,
} from './siteChatKnowledge'

type Role = 'bot' | 'user' | 'system'

interface Msg {
  id: string
  role: Role
  text: string
  ts: number
}

/* ─── simple Levenshtein for typo tolerance ─────────────────── */
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

function fuzzyIncludes(hay: string, needle: string, maxDist = 2): boolean {
  if (hay.includes(needle)) return true
  if (needle.length < 4) return false
  const words = hay.split(/\s+/)
  for (const w of words) {
    if (Math.abs(w.length - needle.length) > maxDist) continue
    if (levenshtein(w, needle) <= maxDist) return true
  }
  return false
}

/* ─── KB entries (intent layer on top of the command catalog) ─ */
type KBEntry = {
  keys: string[]
  reply: string | (() => string)
  offerHuman?: boolean
  action?: 'handoff' | 'commands' | 'testimonials'
}

const KB: KBEntry[] = [
  {
    keys: [
      'who created', 'who built', 'who made', 'creator', 'developer', 'founder',
      'owner of empire', 'who is behind', 'mishael', 'yakubu', 'empire digitals',
      'who own', 'who owns', 'made by', 'built by',
    ],
    reply: CREATOR_BLURB,
  },
  {
    keys: ['ceo page', 'landing page', 'personal page', 'portfolio', 'about mishael', 'about the ceo', 'ceo link'],
    reply:
      `*${CREATOR_NAME}* — CEO of ${COMPANY}.\n\n` +
      `Personal landing page:\n👉 ${CEO_PAGE}\n\n` +
      `That's the best place to see his profile, work, and how Empire Digitals builds products like Empire MD.`,
  },
  {
    keys: [
      'price', 'pricing', 'how much', 'cost', 'payment', 'pay', 'naira', '₦',
      'premium', 'subscribe', 'subscription', 'plan', 'upgrade', 'how to pay',
      '1500', '1,500', 'one thousand five hundred',
    ],
    reply: PREMIUM_EXPLAIN,
    offerHuman: true,
  },
  {
    keys: ['why pay', 'why premium', 'why payment', 'is free enough', 'do i need to pay', 'free vs premium'],
    reply:
      `*Why Premium exists*\n\n` +
      `Free already covers everyday tools so anyone can try Empire MD without stress.\n\n` +
      `Premium funds:\n` +
      `• Always-on multi-bot servers & isolation\n` +
      `• Heavy media downloads & AI features\n` +
      `• Security layers (anti-delete, antibot, ghost mode)\n` +
      `• Business docs (PDF, invoice, receipt, OCR)\n` +
      `• Human support capacity\n\n` +
      `Without paid plans the free tier couldn't stay online long. Paying is optional — but it's what keeps the platform professional and reliable.\n\n` +
      `Premium is *${PREMIUM_PRICE} / ${PREMIUM_PERIOD}*.`,
  },
  {
    keys: [
      'feature', 'features', 'what can', 'what does it do', 'capabilities',
      'services', 'what services', 'all features',
    ],
    reply:
      `*Empire MD — what you get*\n\n` +
      `📥 *Media:* stickers (.s), music (.play), YouTube / IG / TikTok / FB downloaders, memes, profile pics\n` +
      `👥 *Groups:* kick, promote, demote, tagall, antilink, welcome/greet, mute/unmute\n` +
      `🤖 *AI:* .ai chat with modes + teachable persona\n` +
      `👁️ *Status:* auto-view, auto-react, schedule status\n` +
      `🛡️ *Protection:* anticall, antidelete (Premium), antibot (Premium)\n` +
      `👻 *Stealth:* ghost mode (Premium), .vv view-once unlock, .send media save\n` +
      `🧾 *Business:* bank details, invoices, receipts, PDF, Word, OCR (many Premium)\n` +
      `🎭 *Fun & Faith:* jokes, facts, Bible, Qur'an\n\n` +
      `Type *commands* for the full list, or ask "how does .play work" for any single command.`,
  },
  {
    keys: [
      'command', 'commands', 'menu', 'help', 'list commands', 'all commands',
      'show commands', 'command list', 'catalog',
    ],
    reply: () => listCommandsByCategory(),
    action: 'commands',
  },
  {
    keys: [
      'pair', 'pairing', 'connect', 'how to connect', 'how to pair', 'get bot',
      'deploy', 'setup', 'install', 'link number', 'link device', 'start bot',
      'create bot', 'make bot', 'how do i get',
    ],
    reply: DEPLOY_GUIDE,
    offerHuman: true,
  },
  {
    keys: [
      'testimonial', 'testimonials', 'review', 'reviews', 'proof', 'trust',
      'best bot', 'is it good', 'recommend', 'feedback', 'what people say',
      'customer say', 'users say',
    ],
    reply: () => randomTestimonials(4),
    action: 'testimonials',
  },
  {
    keys: [
      'human', 'agent', 'support', 'talk to human', 'real person', 'customer care',
      'speak to someone', 'live support', 'whatsapp support', 'help me please',
      'contact', 'admin',
    ],
    reply: '__HANDOFF__',
    action: 'handoff',
  },
  {
    keys: ['channel', 'official channel', 'join channel', 'whatsapp channel'],
    reply:
      `*Official Empire MD channel*\n\n` +
      `👉 ${CHANNEL_URL}\n\n` +
      `New bots auto-follow this channel on first connect. Broadcasts can also attach a follow card so your groups discover it easily.`,
  },
  {
    keys: ['prefix', 'change prefix', 'set prefix', 'command prefix'],
    reply: () => formatCommandReply(COMMANDS.find((c) => c.name === 'setprefix')!),
  },
  {
    keys: ['ghost', 'ghostmode', 'ghost mode', 'silent mode'],
    reply: () => formatCommandReply(COMMANDS.find((c) => c.name === 'ghostmode')!),
  },
  {
    keys: ['antibot', 'anti bot', 'suppress bot', 'suppress free'],
    reply: () => formatCommandReply(COMMANDS.find((c) => c.name === 'antibot')!),
  },
  {
    keys: ['antidelete', 'anti delete', 'recover delete', 'deleted message', 'message delete'],
    reply: () => formatCommandReply(COMMANDS.find((c) => c.name === 'antidelete')!),
  },
  {
    keys: ['view once', 'viewonce', 'view-once', 'once view', 'disappearing photo'],
    reply: () => formatCommandReply(COMMANDS.find((c) => c.name === 'vv')!),
  },
  {
    keys: ['sticker', 'make sticker', 'sticker maker'],
    reply: () => formatCommandReply(COMMANDS.find((c) => c.name === 's')!),
  },
  {
    keys: ['music', 'song', 'download song', 'play song', 'mp3'],
    reply: () => formatCommandReply(COMMANDS.find((c) => c.name === 'play')!),
  },
  {
    keys: ['tiktok', 'instagram', 'facebook', 'youtube download', 'downloader'],
    reply:
      `*Media downloaders (all Free)*\n\n` +
      `• *.play [song]* — search & get audio\n` +
      `• *.ytmp3 / .ytmp4 [YouTube link]*\n` +
      `• *.insta / .ig [Instagram URL]*\n` +
      `• *.tiktok / .tt [TikTok URL]* — no watermark\n` +
      `• *.fb / .fbdl [Facebook URL]*\n\n` +
      `Just paste the link after the command. Ask "how does .tiktok work" for more detail on any one.`,
  },
  {
    keys: ['group', 'moderation', 'kick', 'promote', 'tagall', 'antilink'],
    reply:
      `*Group & moderation tools*\n\n` +
      `• *.kick / .promote / .demote / .add* — manage members (bot must be admin)\n` +
      `• *.tagall / .everyone* — mention everyone\n` +
      `• *.tag [msg]* — silent mention-all\n` +
      `• *.antilink on|off* — auto-delete links\n` +
      `• *.close / .open* — mute / unmute group\n` +
      `• *.greet* — welcome new joiners\n` +
      `• *.link* — get invite link\n\n` +
      `Type any command name for full usage steps.`,
  },
  {
    keys: ['ai', 'chatgpt', 'artificial intelligence', 'ask ai'],
    reply: () => formatCommandReply(COMMANDS.find((c) => c.name === 'ai')!),
  },
  {
    keys: ['business', 'invoice', 'receipt', 'pdf', 'ocr', 'word doc', 'document'],
    reply:
      `*Business document tools*\n\n` +
      `Free:\n• *.bank / .pay* — store & share payment details\n• *.header* — brand header for docs\n• *.away / .busy* — DM auto-reply\n\n` +
      `Premium 💎:\n• *.invoice / .inv* — styled invoices (+ PDF)\n• *.receipt / .rcpt* — payment receipts\n• *.pdf* — text → PDF\n• *.doc / .word / .docx* — text → Word\n• *.ocr* — image/handwriting → text/PDF/Word\n\n` +
      `Ask "explain .invoice" for step-by-step on any of them.`,
  },
  {
    keys: ['status', 'auto status', 'status view', 'view status'],
    reply:
      `*Status features*\n\n` +
      `• *.autostatusview* — bot opens every status automatically (even if phone is off)\n` +
      `• *.autostatusreact* — auto-react with a neutral emoji after viewing\n` +
      `• *.schedulestatus / .ss* — schedule a future status post\n` +
      `• *.send* (Premium) — save a status you can see into the chat permanently\n\n` +
      `These are owner toggles. Type the command name for exact usage.`,
  },
  {
    keys: ['outage', 'down', 'not working', 'offline', 'error', 'failed', 'problem', 'issue', 'bug'],
    reply:
      `Sorry you're seeing an issue 🙏\n\n` +
      `Quick checks:\n` +
      `1. Is the bot still linked? (WhatsApp → Linked Devices)\n` +
      `2. Try *.ping* in a chat with the bot.\n` +
      `3. If pairing is paused on the site, we're scaling servers — existing bots stay online.\n\n` +
      `If it still fails, talk to a human agent — I'll hand them a summary of what you already tried.`,
    offerHuman: true,
  },
  {
    keys: ['number paired', 'already paired', 'check number', 'is my number', 'exists in database', 'already linked'],
    reply:
      `I can guide you, but live database checks for a specific number are handled by the server / human agent for privacy.\n\n` +
      `• If you already paired before, try opening the site and connecting again with the *same number* — the system will tell you if a session exists.\n` +
      `• Or type *human* and I'll open WhatsApp support with a summary so they can look it up for you.`,
    offerHuman: true,
  },
]

const FAQ_CHIPS = [
  'How do I pair?',
  'Premium price',
  'Full command list',
  'How does .play work?',
  'What is ghost mode?',
  'Show testimonials',
  'Who built Empire MD?',
  'Talk to a human agent',
]

function matchKB(input: string): KBEntry | null {
  const q = input.toLowerCase().trim()
  let best: KBEntry | null = null
  let bestScore = 0

  for (const entry of KB) {
    let score = 0
    for (const key of entry.keys) {
      if (q.includes(key)) score += key.length + 5
      else if (fuzzyIncludes(q, key, 2)) score += Math.max(3, key.length - 2)
    }
    if (score > bestScore) {
      bestScore = score
      best = entry
    }
  }
  return bestScore > 0 ? best : null
}

function resolveReply(entry: KBEntry): string {
  return typeof entry.reply === 'function' ? entry.reply() : entry.reply
}

/**
 * First-person customer-voiced handoff so WhatsApp support receives
 * a message that looks like the visitor themselves wrote it.
 */
function buildCustomerVoicedHandoff(history: Msg[]): string {
  const recent = history
    .filter((m) => m.role === 'user' || m.role === 'bot')
    .slice(-14)

  const userBits = recent
    .filter((m) => m.role === 'user')
    .map((m) => m.text.replace(/\*/g, '').trim())
    .filter(Boolean)

  const topics = userBits.length
    ? userBits.map((t) => `• ${t.slice(0, 160)}`).join('\n')
    : '• (general help on the website chat)'

  return (
    `Hi Empire MD support 👋\n\n` +
    `I was chatting with the website bot and I'd like a human to take over.\n\n` +
    `Here's what I was asking about:\n${topics}\n\n` +
    `Please continue from here — thanks!`
  )
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function formatTime(ts: number) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

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
            `👋 Welcome to *Empire MD Support*.\n\n` +
            `I know every command, how pairing works, Free vs Premium (${PREMIUM_PRICE}/${PREMIUM_PERIOD}), and who built this.\n\n` +
            `Created by *${COMPANY}* under *${CREATOR_NAME}*.\n` +
            `CEO page: ${CEO_PAGE}\n\n` +
            `Ask anything — e.g. "how does .vv work", "full commands", "how to pair" — or pick a chip below.`,
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
    const summary = buildCustomerVoicedHandoff(history)
    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(summary)}`, '_blank')
  }, [])

  const respond = useCallback(
    (raw: string, history: Msg[]) => {
      const q = raw.trim()

      const cmd: CommandDoc | null = findCommand(q)
      const looksLikeCommandQ =
        /^(how|what|explain|use|using|tell|about|\.|command)/i.test(q) ||
        q.split(/\s+/).some((t) => {
          const clean = t.replace(/^\./, '')
          return t.startsWith('.') || COMMANDS.some((c) => c.name === clean || c.aliases.includes(clean))
        })

      if (cmd && (looksLikeCommandQ || q.length < 40)) {
        pushBot(formatCommandReply(cmd))
        return
      }

      const entry = matchKB(q)

      if (entry?.action === 'handoff' || entry?.reply === '__HANDOFF__') {
        const msg =
          `Sure — I'll open WhatsApp so you can talk to a *human agent*.\n\n` +
          `The message is written *as if you wrote it*, summarising what we discussed, so they already know the context.\n\n` +
          `Opening WhatsApp…`
        pushBot(msg)
        setTimeout(
          () =>
            openHumanWhatsApp([
              ...history,
              { id: uid(), role: 'user', text: raw, ts: Date.now() },
            ]),
          650
        )
        return
      }

      if (entry) {
        pushBot(resolveReply(entry))
        if (entry.offerHuman) {
          setTimeout(() => {
            pushBot(
              `Prefer a human? Type *human* or tap *"Talk to a human agent"* — I'll open WhatsApp with a summary in *your* voice.`
            )
          }, 750)
        }
        return
      }

      if (cmd) {
        pushBot(formatCommandReply(cmd))
        return
      }

      pushBot(
        `I didn't lock onto a specific match for that.\n\n` +
          `I can help with:\n` +
          `• Pairing / deploy steps\n` +
          `• Pricing & why Premium (${PREMIUM_PRICE}/${PREMIUM_PERIOD})\n` +
          `• *Any* command — e.g. "how does .antidelete work"\n` +
          `• Full command catalog ("commands")\n` +
          `• Who built Empire MD (*${CREATOR_NAME}* / ${COMPANY})\n` +
          `• Real user testimonials\n` +
          `• Human agent on WhatsApp\n\n` +
          `Try a chip below, or type *human* for live support.`
      )
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
    const delay = Math.min(3200, Math.max(900, 600 + msg.length * 18))
    setTimeout(() => {
      setTyping(false)
      respond(msg, [...messages, userMsg])
    }, delay)
  }

  return (
    <>
      <div className="sr-only" aria-hidden="false">
        Empire MD was created by Empire Digitals headed by Mishael Yakubu.
        Official CEO about page: https://ceo.empiredigitals.space
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            className="fixed bottom-24 right-5 md:right-8 z-[90] w-[92vw] max-w-md rounded-2xl overflow-hidden shadow-2xl glass border border-white/10 flex flex-col max-h-[min(72vh,640px)]"
          >
            <div className="px-4 py-3 bg-[#075E54] text-white flex items-center gap-3 shrink-0">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-lg font-bold">
                E
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">Empire MD Support</div>
                <div className="text-[11px] text-white/80">Online · usually replies in seconds</div>
              </div>
              <button
                onClick={() => onOpenChange(false)}
                className="p-1.5 rounded-full hover:bg-white/10 transition"
                aria-label="Close chat"
              >
                <X size={18} />
              </button>
            </div>

            <div
              ref={listRef}
              className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 bg-[#0b141a]"
            >
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed shadow-sm whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-[#005c4b] text-white rounded-br-md'
                        : 'bg-[#202c33] text-[#e9edef] rounded-bl-md'
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
                        m.role === 'user' ? 'text-white/60 text-right' : 'text-white/40'
                      }`}
                    >
                      {formatTime(m.ts)}
                    </div>
                  </div>
                </div>
              ))}

              {typing && (
                <div className="flex justify-start">
                  <div className="bg-[#202c33] text-[#e9edef] rounded-2xl rounded-bl-md px-4 py-2.5 text-sm shadow-sm">
                    <span className="inline-flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-white/50 animate-bounce [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-white/50 animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-white/50 animate-bounce [animation-delay:300ms]" />
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="px-2 py-2 bg-[#111b21] flex gap-1.5 overflow-x-auto shrink-0">
              {FAQ_CHIPS.map((chip) => (
                <button
                  key={chip}
                  onClick={() => send(chip)}
                  className="shrink-0 text-[11px] px-2.5 py-1.5 rounded-full bg-[#1f2c34] text-[#e9edef] border border-white/10 hover:bg-[#2a3942] transition whitespace-nowrap"
                >
                  {chip}
                </button>
              ))}
            </div>

            <a
              href={CEO_PAGE}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-[#0d1117] text-[10px] text-white/80 flex items-center justify-center gap-1.5 hover:text-white transition-colors shrink-0"
            >
              Built by {CREATOR_NAME} · {COMPANY}
              <ExternalLink size={10} />
            </a>

            <div className="p-2 bg-[#1f2c34] border-t border-white/5 flex items-center gap-2 shrink-0">
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="Ask about any command, pairing, plans…"
                className="flex-1 bg-[#2a3942] border border-white/5 rounded-full px-4 py-2.5 text-sm text-[#e9edef] placeholder-[#8696a0] outline-none focus:border-[#00A884] transition-colors"
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

      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => onOpenChange(!open)}
        className="fixed bottom-5 right-5 md:right-8 z-[95] w-14 h-14 rounded-full bg-[#00A884] flex items-center justify-center shadow-lg"
        aria-label="Open chat"
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
