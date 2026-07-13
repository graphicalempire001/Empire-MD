import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, Trash2, Flag, Send, RefreshCw, CheckSquare, Square, ShieldCheck } from 'lucide-react'

interface AdminBot {
  session_id: string
  bot_name: string
  phone_number: string
  status: string
  usage_count?: number
  flagged?: boolean
}

export default function Admin() {
  const [key, setKey] = useState('')
  const [authed, setAuthed] = useState(false)
  const [bots, setBots] = useState<AdminBot[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [dmOpen, setDmOpen] = useState(false)
  const [dmText, setDmText] = useState('')

  const headers = { 'Content-Type': 'application/json', 'x-admin-key': key }

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500) }

  const loadUsage = async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/admin/usage?limit=200', { headers: { 'x-admin-key': key } })
      if (res.status === 403) { setError('Wrong admin password.'); setAuthed(false); setLoading(false); return }
      const data = await res.json()
      if (data.success) { setBots(data.bots || []); setAuthed(true) }
    } catch { setError('Network error.') }
    setLoading(false)
  }

  const toggle = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }
  const allSelected = bots.length > 0 && selected.size === bots.length
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(bots.map((b) => b.session_id)))

  const doDelete = async () => {
    if (!selected.size || !confirm(`Delete ${selected.size} bot(s)? This is permanent.`)) return
    for (const id of selected) {
      await fetch(`/api/admin/bot/${id}`, { method: 'DELETE', headers: { 'x-admin-key': key } })
    }
    flash(`Deleted ${selected.size} bot(s).`); setSelected(new Set()); loadUsage()
  }

  const doFlag = async (value: boolean) => {
    if (!selected.size) return
    for (const id of selected) {
      await fetch(`/api/admin/flag/${id}`, { method: 'POST', headers, body: JSON.stringify({ value }) })
    }
    flash(`${value ? 'Flagged' : 'Unflagged'} ${selected.size} bot(s).`); setSelected(new Set()); loadUsage()
  }

  const doDM = async () => {
    if (!selected.size || !dmText.trim()) return
    for (const id of selected) {
      await fetch(`/api/admin/dm/${id}`, { method: 'POST', headers, body: JSON.stringify({ message: dmText }) })
    }
    flash(`Message sent to ${selected.size} owner(s).`); setDmText(''); setDmOpen(false); setSelected(new Set())
  }

  /* ---------- LOGIN GATE ---------- */
  if (!authed) {
    return (
      <section className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: '#EDEEF5' }}>
        <div className="absolute inset-0 bg-cover bg-center opacity-20" style={{ backgroundImage: "url('/hero-bg.jpg')" }} />
        <div className="absolute inset-0 bg-[#EDEEF5]/60" />
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.5 }}
          className="glass-card rounded-3xl p-8 md:p-10 w-full max-w-sm relative z-10 shadow-xl text-center"
        >
          <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-[#00A884]/10 flex items-center justify-center">
            <Lock className="text-[#00A884]" />
          </div>
          <h2 className="heading-md text-[#1a1a1a] mb-1">Admin <span className="text-gradient-green">Access</span></h2>
          <p className="body-text mb-6">Enter your admin password to manage the Empire network.</p>
          <input
            type="password" value={key} onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadUsage()}
            placeholder="Admin password"
            className="w-full bg-white/80 border border-black/[0.06] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] placeholder-[#8e8e8e] outline-none focus:border-[#00A884] focus:ring-2 focus:ring-[#00A884]/20 transition mb-3"
          />
          {error && <p className="text-[#e5484d] text-sm mb-3">{error}</p>}
          <motion.button whileTap={{ scale: 0.97 }} whileHover={{ y: -2 }} onClick={loadUsage} disabled={loading || !key}
            className="whatsapp-btn w-full py-3.5 disabled:opacity-60">
            {loading ? 'Verifying…' : 'Unlock Dashboard'}
          </motion.button>
        </motion.div>
      </section>
    )
  }

  /* ---------- DASHBOARD ---------- */
  return (
    <section className="min-h-screen section-padding py-16" style={{ backgroundColor: '#EDEEF5' }}>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <div>
            <h2 className="heading-lg text-[#1a1a1a] flex items-center gap-2">
              <ShieldCheck className="text-[#00A884]" /> Admin <span className="text-gradient-green">Dashboard</span>
            </h2>
            <p className="body-text mt-1">{bots.length} bots · {selected.size} selected</p>
          </div>
          <motion.button whileTap={{ scale: 0.95 }} onClick={loadUsage}
            className="glass-card rounded-full px-4 py-2 text-sm text-[#1a1a1a] inline-flex items-center gap-2 hover:text-[#00A884] transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </motion.button>
        </div>

        {/* Action bar */}
        <AnimatePresence>
          {selected.size > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="glass-card rounded-2xl p-3 mb-5 flex flex-wrap items-center gap-2 sticky top-3 z-30"
            >
              <button onClick={toggleAll} className="text-sm text-[#1a1a1a] inline-flex items-center gap-1.5 px-2">
                {allSelected ? <CheckSquare size={16} className="text-[#00A884]" /> : <Square size={16} />} All
              </button>
              <div className="flex-1" />
              <motion.button whileTap={{ scale: 0.95 }} onClick={() => setDmOpen(true)}
                className="bg-gradient-green text-white text-sm font-semibold rounded-full px-4 py-2 inline-flex items-center gap-1.5">
                <Send size={14} /> Message
              </motion.button>
              <motion.button whileTap={{ scale: 0.95 }} onClick={() => doFlag(true)}
                className="bg-white/80 border border-black/[0.06] text-[#1a1a1a] text-sm font-semibold rounded-full px-4 py-2 inline-flex items-center gap-1.5 hover:bg-white">
                <Flag size={14} /> Flag
              </motion.button>
              <motion.button whileTap={{ scale: 0.95 }} onClick={doDelete}
                className="bg-[#e5484d] text-white text-sm font-semibold rounded-full px-4 py-2 inline-flex items-center gap-1.5">
                <Trash2 size={14} /> Delete
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bot grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {bots.map((bot, i) => {
              const sel = selected.has(bot.session_id)
              return (
                <motion.div
                  key={bot.session_id}
                  layout
                  initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }} transition={{ type: 'spring', stiffness: 300, damping: 22, delay: (i % 9) * 0.03 }}
                  onClick={() => toggle(bot.session_id)}
                  className={`glass-card rounded-2xl p-5 cursor-pointer relative transition-all ${sel ? 'ring-2 ring-[#00A884]' : 'ring-1 ring-transparent'}`}
                >
                  <div className="absolute top-4 right-4">
                    {sel ? <CheckSquare size={18} className="text-[#00A884]" /> : <Square size={18} className="text-[#b0b0b8]" />}
                  </div>
                  {bot.flagged && (
                    <span className="absolute top-4 left-4 text-[10px] font-semibold text-[#e5484d] inline-flex items-center gap-1">
                      <Flag size={11} /> Flagged
                    </span>
                  )}
                  <h3 className="heading-md text-base text-[#1a1a1a] mt-4 mb-1 truncate">{bot.bot_name}</h3>
                  <p className="body-text text-xs mb-2">{bot.phone_number}</p>
                  <code className="block bg-white/70 border border-black/[0.06] rounded-lg px-2 py-1.5 text-[11px] text-[#00A884] font-mono truncate">
                    {bot.session_id}
                  </code>
                  <div className="flex items-center justify-between mt-3 body-text text-xs">
                    <span className="text-[#00A884]">● {bot.status || 'online'}</span>
                    {typeof bot.usage_count === 'number' && <span>{bot.usage_count} msgs</span>}
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* DM modal */}
      <AnimatePresence>
        {dmOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-[#EDEEF5]/70 backdrop-blur-sm" onClick={() => setDmOpen(false)} />
            <motion.div
              initial={{ scale: 0.94, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.94, opacity: 0 }}
              className="glass-card relative z-10 w-full max-w-md rounded-3xl p-7 shadow-2xl"
            >
              <h3 className="heading-md text-[#1a1a1a] mb-1">Message <span className="text-gradient-green">{selected.size}</span> owner(s)</h3>
              <p className="body-text mb-4">This sends a direct WhatsApp DM from each bot to its owner.</p>
              <textarea
                value={dmText} onChange={(e) => setDmText(e.target.value)} rows={4}
                placeholder="Type your broadcast message…"
                className="w-full bg-white/80 border border-black/[0.06] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] placeholder-[#8e8e8e] outline-none focus:border-[#00A884] focus:ring-2 focus:ring-[#00A884]/20 transition mb-4 resize-none"
              />
              <div className="flex gap-3">
                <button onClick={() => setDmOpen(false)} className="flex-1 bg-white/80 border border-black/[0.06] rounded-full py-3 text-sm font-semibold text-[#1a1a1a] hover:bg-white transition">Cancel</button>
                <motion.button whileTap={{ scale: 0.97 }} onClick={doDM} disabled={!dmText.trim()} className="flex-1 whatsapp-btn py-3 disabled:opacity-60">Send</motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[110] glass-card glow-green rounded-full px-5 py-3 text-sm font-medium text-[#1a1a1a]">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
