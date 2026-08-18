import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Lock, RefreshCw, MessageSquare, LayoutGrid, KeyRound, LogOut,
  Ghost, CheckCircle2, ArrowLeft, Puzzle, Trash2, RotateCcw, Send,
  Activity, HardDrive, Clock, Crown,
} from 'lucide-react'
import { COMMANDS, DEFAULT_PREFIX } from '../components/siteChatKnowledge'

const TOKEN_KEY = 'empiremd_dashboard_token'
const BOTNAME_KEY = 'empiremd_dashboard_botname'

interface BotInfo {
  session_id: string
  bot_name: string
  phone_number: string
  status: string
  plan: string
  plan_expires_at: string | null
  is_whitelisted: boolean
  ghost_mode: boolean
  health?: string
  uptime_ms?: number | null
  started_at?: string | null
  capacity?: { disk_use_percent: number | null; ram_use_percent: number | null }
  premium_remaining_ms?: number | null
}

interface ChatSummary {
  chat_jid: string
  last: { sender_name: string | null; body: string | null; from_me: boolean; msg_type: string; created_at: string }
  unread_count: number
}

interface Message {
  id: number
  chat_jid: string
  sender_jid: string | null
  sender_name: string | null
  from_me: boolean
  msg_type: string
  body: string | null
  media_url?: string | null
  media_mime?: string | null
  created_at: string
}

type Tab = 'overview' | 'chats' | 'commands' | 'plugins'
type AuthView = 'login' | 'forgot-request' | 'forgot-reset'

function formatUptime(ms: number | null | undefined) {
  if (ms == null || ms < 0) return '—'
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatRemaining(ms: number | null | undefined, whitelisted: boolean) {
  if (whitelisted) return 'Unlimited (whitelisted)'
  if (ms == null) return '—'
  if (ms <= 0) return 'Expired'
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  if (d > 0) return `${d} day${d === 1 ? '' : 's'} ${h}h left`
  const m = Math.floor((s % 3600) / 60)
  return `${h}h ${m}m left`
}

export default function Dashboard() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [botName, setBotName] = useState('')
  const [password, setPassword] = useState('')
  const [authView, setAuthView] = useState<AuthView>('login')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [otp, setOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [resetNote, setResetNote] = useState('')

  const [tab, setTab] = useState<Tab>('overview')
  const [bot, setBot] = useState<BotInfo | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState('')

  const [chats, setChats] = useState<ChatSummary[]>([])
  const [chatsLoading, setChatsLoading] = useState(false)
  const [activeChat, setActiveChat] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)

  const authHeaders = { 'x-dashboard-token': token || '', 'Content-Type': 'application/json' }

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(BOTNAME_KEY)
    setToken(null)
    setBot(null)
  }

  const loadMe = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch('/api/dashboard/me', { headers: { 'x-dashboard-token': token } })
      const data = await res.json()
      if (data.success) setBot(data.bot)
      else { setError(data.error || 'Session expired'); logout() }
    } catch {
      setError('Network error')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => { loadMe() }, [loadMe])

  const login = async () => {
    setError('')
    if (!botName.trim() || !password) return setError('Enter your bot name and password.')
    setLoading(true)
    try {
      const res = await fetch('/api/dashboard/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: botName.trim(), password }),
      })
      const data = await res.json()
      if (!data.success) { setError(data.error || 'Login failed'); return }
      localStorage.setItem(TOKEN_KEY, data.token)
      localStorage.setItem(BOTNAME_KEY, data.botName)
      setToken(data.token)
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  const requestOtp = async () => {
    setError(''); setResetNote('')
    if (!botName.trim()) return setError('Enter your bot name first.')
    setLoading(true)
    try {
      const res = await fetch('/api/dashboard/request-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: botName.trim() }),
      })
      const data = await res.json()
      if (!data.success) { setError(data.error || 'Failed'); return }
      setResetNote(data.note || 'Code sent.')
      setAuthView('forgot-reset')
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  const submitReset = async () => {
    setError('')
    if (!otp || newPassword.length < 6) return setError('Enter the code and a password of at least 6 characters.')
    setLoading(true)
    try {
      const res = await fetch('/api/dashboard/verify-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: botName.trim(), otp, newPassword }),
      })
      const data = await res.json()
      if (!data.success) { setError(data.error || 'Failed'); return }
      setAuthView('login')
      setPassword('')
      setOtp('')
      setNewPassword('')
      setResetNote('Password updated — log in below.')
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  const refreshSession = async () => {
    setRefreshing(true); setRefreshMsg('')
    try {
      const res = await fetch('/api/dashboard/refresh', { method: 'POST', headers: { 'x-dashboard-token': token || '' } })
      const data = await res.json()
      if (data.success) {
        setRefreshMsg(data.alreadyOnline ? 'Already online.' : `New pairing code: ${data.code} — enter it in WhatsApp within 2 minutes.`)
        setTimeout(loadMe, 3000)
      } else {
        setRefreshMsg(data.error || 'Refresh failed')
      }
    } catch {
      setRefreshMsg('Network error')
    } finally {
      setRefreshing(false)
    }
  }

  const restartBot = async () => {
    if (!confirm('Restart your bot process? It may need a pairing code if the session was lost.')) return
    setRestarting(true); setRefreshMsg('')
    try {
      const res = await fetch('/api/dashboard/restart', { method: 'POST', headers: { 'x-dashboard-token': token || '' } })
      const data = await res.json()
      if (data.success) {
        if (data.code) setRefreshMsg(`Restarted — pairing code: ${data.code}`)
        else setRefreshMsg(data.status === 'online' ? 'Restarted and online.' : `Restarted (${data.status}).`)
        setTimeout(loadMe, 3000)
      } else {
        setRefreshMsg(data.error || 'Restart failed')
      }
    } catch {
      setRefreshMsg('Network error')
    } finally {
      setRestarting(false)
    }
  }

  const loadChats = useCallback(async () => {
    if (!token) return
    setChatsLoading(true)
    try {
      const res = await fetch('/api/dashboard/chats', { headers: { 'x-dashboard-token': token } })
      const data = await res.json()
      if (data.success) setChats(data.chats || [])
    } finally {
      setChatsLoading(false)
    }
  }, [token])

  useEffect(() => { if (tab === 'chats') loadChats() }, [tab, loadChats])

  const openChat = async (chatJid: string) => {
    setActiveChat(chatJid)
    setReplyText('')
    setMessagesLoading(true)
    try {
      const res = await fetch(`/api/dashboard/messages?chat=${encodeURIComponent(chatJid)}`, {
        headers: { 'x-dashboard-token': token || '' },
      })
      const data = await res.json()
      if (data.success) setMessages(data.messages || [])
      // Viewing alone does NOT clear WhatsApp blue-ticks — only a reply does.
      // Unread badge stays until you reply (or we optionally clear UI-only later).
    } finally {
      setMessagesLoading(false)
    }
  }

  const sendReply = async () => {
    if (!activeChat || !replyText.trim() || sending) return
    setSending(true)
    try {
      const res = await fetch('/api/dashboard/reply', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ chatJid: activeChat, text: replyText.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        const optimistic: Message = {
          id: Date.now(),
          chat_jid: activeChat,
          sender_jid: null,
          sender_name: bot?.bot_name || 'You',
          from_me: true,
          msg_type: 'text',
          body: replyText.trim(),
          created_at: new Date().toISOString(),
        }
        setMessages((prev) => [...prev, optimistic])
        setReplyText('')
        // Clear unread after a real reply
        setChats((prev) => prev.map((c) => (c.chat_jid === activeChat ? { ...c, unread_count: 0 } : c)))
      } else {
        alert(data.error || 'Failed to send')
      }
    } catch {
      alert('Network error')
    } finally {
      setSending(false)
    }
  }

  const [disposing, setDisposing] = useState(false)
  const disposeChat = async (chatJid: string) => {
    setDisposing(true)
    try {
      const res = await fetch(`/api/dashboard/chats?chat=${encodeURIComponent(chatJid)}`, {
        method: 'DELETE', headers: { 'x-dashboard-token': token || '' },
      })
      const data = await res.json()
      if (data.success) {
        setChats((prev) => prev.filter((c) => c.chat_jid !== chatJid))
        setActiveChat(null)
        setMessages([])
      }
    } finally {
      setDisposing(false)
    }
  }

  const chatLabel = (jid: string) => jid.endsWith('@g.us') ? `Group · ${jid.split('@')[0]}` : jid.split('@')[0]
  const fmtTime = (d: string) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  /* ---------- LOGIN / AUTH VIEWS ---------- */
  if (!token) {
    return (
      <section className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: '#EDEEF5' }}>
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.5 }}
          className="glass-card rounded-3xl p-8 md:p-10 w-full max-w-sm shadow-xl text-center"
        >
          <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-[#00A884]/10 flex items-center justify-center">
            <Lock className="text-[#00A884]" />
          </div>
          <h2 className="heading-md text-[#1a1a1a] mb-1">
            {authView === 'login' ? 'Your ' : ''}<span className="text-gradient-green">Dashboard</span>
          </h2>
          <p className="body-text mb-6">
            {authView === 'login' && 'Manage your WhatsApp bot outside WhatsApp. Premium members only.'}
            {authView === 'forgot-request' && "Enter your bot name — we'll text a reset code to your own WhatsApp."}
            {authView === 'forgot-reset' && resetNote}
          </p>

          {authView === 'login' && (
            <>
              <input
                value={botName} onChange={(e) => setBotName(e.target.value)}
                placeholder="Bot name (username)"
                className="w-full bg-white/80 border border-black/[0.06] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] outline-none focus:border-[#00A884] transition mb-3"
              />
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && login()}
                placeholder="Password"
                className="w-full bg-white/80 border border-black/[0.06] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] outline-none focus:border-[#00A884] transition mb-3"
              />
              {error && <p className="text-[#e5484d] text-sm mb-3">{error}</p>}
              <motion.button whileTap={{ scale: 0.97 }} onClick={login} disabled={loading}
                className="whatsapp-btn w-full py-3.5 disabled:opacity-60 mb-3">
                {loading ? 'Logging in…' : 'Log In'}
              </motion.button>
              <button onClick={() => { setAuthView('forgot-request'); setError('') }} className="text-xs text-[#8e8e8e] hover:text-[#1a1a1a] transition-colors">
                Forgot password?
              </button>
              <p className="text-[11px] text-[#8e8e8e] mt-4">
                Default password is your session ID, sent to your WhatsApp when Premium activated.
              </p>
            </>
          )}

          {authView === 'forgot-request' && (
            <>
              <input
                value={botName} onChange={(e) => setBotName(e.target.value)}
                placeholder="Bot name"
                className="w-full bg-white/80 border border-black/[0.06] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] outline-none focus:border-[#00A884] transition mb-3"
              />
              {error && <p className="text-[#e5484d] text-sm mb-3">{error}</p>}
              <motion.button whileTap={{ scale: 0.97 }} onClick={requestOtp} disabled={loading}
                className="whatsapp-btn w-full py-3.5 disabled:opacity-60 mb-3">
                {loading ? 'Sending…' : 'Send code to my WhatsApp'}
              </motion.button>
              <button onClick={() => setAuthView('login')} className="text-xs text-[#8e8e8e] hover:text-[#1a1a1a] inline-flex items-center gap-1">
                <ArrowLeft size={12} /> Back to login
              </button>
            </>
          )}

          {authView === 'forgot-reset' && (
            <>
              <input
                value={otp} onChange={(e) => setOtp(e.target.value)}
                placeholder="6-digit code"
                className="w-full bg-white/80 border border-black/[0.06] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] outline-none focus:border-[#00A884] transition mb-3 text-center tracking-[0.3em]"
              />
              <input
                type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (min 6 characters)"
                className="w-full bg-white/80 border border-black/[0.06] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] outline-none focus:border-[#00A884] transition mb-3"
              />
              {error && <p className="text-[#e5484d] text-sm mb-3">{error}</p>}
              <motion.button whileTap={{ scale: 0.97 }} onClick={submitReset} disabled={loading}
                className="whatsapp-btn w-full py-3.5 disabled:opacity-60 mb-3">
                {loading ? 'Updating…' : 'Set new password'}
              </motion.button>
              <button onClick={() => setAuthView('login')} className="text-xs text-[#8e8e8e] hover:text-[#1a1a1a] inline-flex items-center gap-1">
                <ArrowLeft size={12} /> Back to login
              </button>
            </>
          )}
        </motion.div>
      </section>
    )
  }

  /* ---------- DASHBOARD ---------- */
  return (
    <section className="min-h-screen section-padding py-10 md:py-16" style={{ backgroundColor: '#EDEEF5' }}>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h2 className="heading-lg text-[#1a1a1a]">
              {bot?.bot_name || 'Your'} <span className="text-gradient-green">Dashboard</span>
            </h2>
            {bot && (
              <p className="body-text mt-1 inline-flex items-center gap-2">
                <span className={bot.status === 'online' ? 'text-[#00A884]' : 'text-[#8e8e8e]'}>● {bot.status}</span>
                {bot.ghost_mode && <span className="inline-flex items-center gap-1 text-[#8e8e8e]"><Ghost size={12} /> Ghost Mode on</span>}
              </p>
            )}
          </div>
          <button onClick={logout} className="glass-card rounded-full px-4 py-2 text-sm text-[#8e8e8e] hover:text-[#1a1a1a] inline-flex items-center gap-1.5 transition-colors">
            <LogOut size={14} /> Log out
          </button>
        </div>

        <div className="flex gap-2 mb-6 flex-wrap">
          {([
            { id: 'overview' as Tab, label: 'Overview', icon: LayoutGrid },
            { id: 'chats' as Tab, label: 'Chats', icon: MessageSquare },
            { id: 'commands' as Tab, label: 'Commands', icon: KeyRound },
            { id: 'plugins' as Tab, label: 'Plugins', icon: Puzzle },
          ]).map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => { setTab(id); setActiveChat(null) }}
              className={`text-xs font-semibold px-4 py-2.5 rounded-full inline-flex items-center gap-1.5 transition-colors ${
                tab === id ? 'bg-[#1a1a1a] text-white' : 'glass-card text-[#8e8e8e] hover:text-[#1a1a1a]'
              }`}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        {tab === 'overview' && bot && (
          <div className="space-y-4">
            <div className="glass-card rounded-2xl p-6 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-xs text-[#8e8e8e] mb-1 inline-flex items-center gap-1"><Activity size={12} /> Health</p>
                  <p className={`font-medium ${bot.health === 'healthy' ? 'text-[#00A884]' : 'text-[#8e8e8e]'}`}>
                    {bot.health === 'healthy' ? 'Healthy' : 'Offline'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#8e8e8e] mb-1 inline-flex items-center gap-1"><Clock size={12} /> Uptime</p>
                  <p className="text-[#1a1a1a] font-medium">{formatUptime(bot.uptime_ms)}</p>
                </div>
                <div>
                  <p className="text-xs text-[#8e8e8e] mb-1 inline-flex items-center gap-1"><HardDrive size={12} /> Capacity</p>
                  <p className="text-[#1a1a1a] font-medium text-xs">
                    Disk {bot.capacity?.disk_use_percent ?? '—'}% · RAM {bot.capacity?.ram_use_percent ?? '—'}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#8e8e8e] mb-1">Phone</p>
                  <p className="text-[#1a1a1a] font-medium">{bot.phone_number}</p>
                </div>
                <div>
                  <p className="text-xs text-[#8e8e8e] mb-1 inline-flex items-center gap-1"><Crown size={12} /> Plan</p>
                  <p className="text-[#1a1a1a] font-medium capitalize">{bot.plan}{bot.is_whitelisted ? ' (whitelisted)' : ''}</p>
                </div>
                <div>
                  <p className="text-xs text-[#8e8e8e] mb-1">Premium time left</p>
                  <p className="text-[#1a1a1a] font-medium text-xs">
                    {formatRemaining(bot.premium_remaining_ms, bot.is_whitelisted)}
                  </p>
                </div>
                {bot.plan_expires_at && !bot.is_whitelisted && (
                  <div>
                    <p className="text-xs text-[#8e8e8e] mb-1">Expires</p>
                    <p className="text-[#1a1a1a] font-medium">{new Date(bot.plan_expires_at).toLocaleString()}</p>
                  </div>
                )}
                <div className="col-span-2 md:col-span-1">
                  <p className="text-xs text-[#8e8e8e] mb-1">Session ID</p>
                  <p className="text-[#1a1a1a] font-mono text-xs truncate">{bot.session_id}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <motion.button whileTap={{ scale: 0.97 }} onClick={refreshSession} disabled={refreshing}
                  className="whatsapp-btn px-5 py-2.5 text-sm inline-flex items-center gap-2 disabled:opacity-60">
                  <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh session
                </motion.button>
                <motion.button whileTap={{ scale: 0.97 }} onClick={restartBot} disabled={restarting}
                  className="glass-card px-5 py-2.5 text-sm inline-flex items-center gap-2 text-[#1a1a1a] disabled:opacity-60">
                  <RotateCcw size={14} className={restarting ? 'animate-spin' : ''} /> Restart bot
                </motion.button>
              </div>
              {refreshMsg && <p className="text-xs text-[#00A884] inline-flex items-center gap-1"><CheckCircle2 size={12} /> {refreshMsg}</p>}
              <p className="text-[11px] text-[#8e8e8e]">Refresh reconnects if offline. Restart kills and respawns only your bot process.</p>
            </div>
          </div>
        )}

        {tab === 'chats' && !activeChat && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="body-text">{chatsLoading ? 'Loading…' : `${chats.length} chats`}</p>
              <button onClick={loadChats} className="glass-card rounded-full px-3.5 py-2 text-xs text-[#1a1a1a] inline-flex items-center gap-1.5">
                <RefreshCw size={13} className={chatsLoading ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>
            <div className="space-y-2">
              {chats.map((c) => (
                <button key={c.chat_jid} onClick={() => openChat(c.chat_jid)}
                  className="w-full text-left glass-card rounded-xl p-4 hover:bg-white/60 transition-colors flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#1a1a1a]">{chatLabel(c.chat_jid)}</p>
                    <p className="text-xs text-[#8e8e8e] truncate mt-0.5">
                      {c.last.from_me ? 'You: ' : ''}{c.last.body || `[${c.last.msg_type}]`}
                    </p>
                  </div>
                  {c.unread_count > 0 && (
                    <span className="shrink-0 text-[10px] font-bold text-white bg-[#00A884] rounded-full min-w-[20px] h-5 px-1.5 inline-flex items-center justify-center">
                      {c.unread_count > 99 ? '99+' : c.unread_count}
                    </span>
                  )}
                </button>
              ))}
              {!chats.length && !chatsLoading && <p className="text-center body-text py-12">No messages logged yet — they'll appear here as your bot receives them.</p>}
            </div>
          </div>
        )}

        {tab === 'chats' && activeChat && (
          <div>
            <button onClick={() => setActiveChat(null)} className="text-xs text-[#8e8e8e] hover:text-[#1a1a1a] inline-flex items-center gap-1 mb-4">
              <ArrowLeft size={12} /> All chats
            </button>
            <div className="flex items-center justify-between mb-3">
              <h3 className="heading-md text-base text-[#1a1a1a]">{chatLabel(activeChat)}</h3>
              <button
                onClick={() => { if (confirm("Delete this whole chat history? This can't be undone.")) disposeChat(activeChat) }}
                disabled={disposing}
                className="text-[10px] font-semibold px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 bg-[#e5484d]/10 text-[#e5484d] hover:bg-[#e5484d]/20 transition-colors disabled:opacity-50"
              >
                <Trash2 size={12} /> {disposing ? 'Disposing…' : 'Dispose chat'}
              </button>
            </div>
            <div className="glass-card rounded-2xl p-4 space-y-3 max-h-[55vh] overflow-y-auto mb-3">
              {messagesLoading && <p className="text-center body-text py-6">Loading…</p>}
              {messages.map((m) => (
                <div key={m.id} className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                  m.from_me ? 'ml-auto bg-[#00A884] text-white' : 'bg-white/80 text-[#1a1a1a]'
                }`}>
                  {!m.from_me && m.sender_name && <p className="text-[10px] opacity-70 mb-0.5">{m.sender_name}</p>}

                  {/* Image */}
                  {m.msg_type === 'image' && m.media_url && (
                    <a href={m.media_url} target="_blank" rel="noreferrer" className="block mb-1">
                      <img src={m.media_url} alt="" className="rounded-xl max-h-56 object-cover" />
                    </a>
                  )}

                  {/* Voice note / audio */}
                  {m.msg_type === 'audio' && m.media_url && (
                    <audio controls src={m.media_url} className="w-full max-w-xs my-1" />
                  )}

                  {/* Video placeholder — full support later */}
                  {m.msg_type === 'video' && (
                    <p className="text-xs opacity-80 italic mb-1">[video — playback coming soon]</p>
                  )}

                  {m.body && m.body !== `[${m.msg_type}]` && <p>{m.body}</p>}
                  {!m.body && !m.media_url && m.msg_type !== 'text' && <p>[{m.msg_type}]</p>}

                  <p className={`text-[10px] mt-1 ${m.from_me ? 'text-white/70' : 'text-[#8e8e8e]'}`}>{fmtTime(m.created_at)}</p>
                </div>
              ))}
              {!messages.length && !messagesLoading && <p className="text-center body-text py-6">No messages in this chat yet.</p>}
            </div>

            {/* Reply box — blue-ticks WhatsApp only after send */}
            <div className="flex gap-2">
              <input
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendReply()}
                placeholder="Type a reply… (marks chat read on WhatsApp when sent)"
                className="flex-1 bg-white/80 border border-black/[0.06] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] outline-none focus:border-[#00A884] transition"
              />
              <motion.button whileTap={{ scale: 0.97 }} onClick={sendReply} disabled={sending || !replyText.trim()}
                className="whatsapp-btn px-4 py-3 rounded-xl inline-flex items-center gap-1.5 disabled:opacity-50">
                <Send size={16} /> {sending ? '…' : 'Send'}
              </motion.button>
            </div>
            <p className="text-[10px] text-[#8e8e8e] mt-2">Bot only marks the chat as read on WhatsApp after you send a reply.</p>
          </div>
        )}

        {tab === 'commands' && (
          <div className="space-y-2">
            {COMMANDS.map((c) => (
              <div key={c.name} className="glass-card rounded-xl p-4">
                <p className="font-display font-semibold text-sm text-[#1a1a1a]">{DEFAULT_PREFIX}{c.name}</p>
                <p className="text-xs text-[#8e8e8e] mt-0.5">{c.short}</p>
                <p className="text-xs text-[#8e8e8e] mt-1"><span className="text-[#1a1a1a] font-medium">Usage: </span>{c.usage}</p>
              </div>
            ))}
          </div>
        )}

        {tab === 'plugins' && (
          <div className="glass-card rounded-2xl p-10 text-center">
            <Puzzle className="mx-auto mb-3 text-[#00A884]" size={28} />
            <h3 className="heading-md text-[#1a1a1a] mb-1">Coming soon</h3>
            <p className="body-text">Install extra command packs for your bot right from here — not live yet.</p>
          </div>
        )}
      </div>
    </section>
  )
}
