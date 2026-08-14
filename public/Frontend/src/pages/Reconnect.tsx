import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, Copy, CheckCircle2, Smartphone } from 'lucide-react'
import PageHeader from '../components/PageHeader'

type Status = 'idle' | 'loading' | 'code' | 'connected' | 'already' | 'error'

export default function Reconnect() {
  const [phone, setPhone] = useState('')
  const [botName, setBotName] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [code, setCode] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => () => stopPolling(), [stopPolling])

  const startPolling = (sid: string) => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/status/${sid}`)
        const data = await res.json()
        if (data.status === 'connected') {
          stopPolling()
          setStatus('connected')
        } else if (data.status === 'error') {
          stopPolling()
          setError(data.error || 'Reconnect failed.')
          setStatus('error')
        } else if (data.status === 'expired') {
          stopPolling()
          setError('Pairing code expired. Try again.')
          setStatus('error')
        }
      } catch {
        /* keep polling */
      }
    }, 2500)
  }

  const handleReconnect = async () => {
    setError('')
    const cleanPhone = phone.replace(/[^0-9]/g, '')
    if (!cleanPhone && !botName.trim()) {
      setError('Enter your phone number or bot name.')
      return
    }
    setStatus('loading')
    try {
      const res = await fetch('/api/reconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: cleanPhone || undefined, botName: botName.trim() || undefined }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error || "Couldn't find that session.")
        setStatus('error')
        return
      }
      setSessionId(data.sessionId)
      if (data.alreadyOnline) {
        setStatus('already')
        return
      }
      setCode(data.code || '')
      setStatus('code')
      startPolling(data.sessionId)
    } catch {
      setError('Network error — try again.')
      setStatus('error')
    }
  }

  const copyCode = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const reset = () => {
    stopPolling()
    setStatus('idle')
    setError('')
    setCode('')
    setSessionId('')
  }

  return (
    <div className="min-h-screen">
      <PageHeader eyebrow="Support" title="Reconnect Your Bot" />
      <main className="section-padding pb-24">
        <div className="max-w-md mx-auto">
          <p className="body-text mb-8">
            Bot disconnected? If you know the number or bot name you paired with, reconnect to your
            existing session — your settings, history, and Premium status (if active) all carry over.
          </p>

          {(status === 'idle' || status === 'loading' || status === 'error') && (
            <div className="glass-card rounded-2xl p-6">
              <label className="block text-xs font-medium text-[#8e8e8e] mb-1.5">Phone number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="2348012345678"
                className="w-full bg-white/80 border border-black/[0.06] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] outline-none focus:border-[#00A884] transition mb-4"
              />
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-black/[0.06]" />
                <span className="text-[10px] text-[#8e8e8e] uppercase tracking-wider">or</span>
                <div className="flex-1 h-px bg-black/[0.06]" />
              </div>
              <label className="block text-xs font-medium text-[#8e8e8e] mb-1.5">Bot name</label>
              <input
                type="text"
                value={botName}
                onChange={(e) => setBotName(e.target.value)}
                placeholder="The name you paired with"
                className="w-full bg-white/80 border border-black/[0.06] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] outline-none focus:border-[#00A884] transition mb-5"
              />
              {error && <p className="text-sm text-[#e5484d] mb-4">{error}</p>}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleReconnect}
                disabled={status === 'loading'}
                className="whatsapp-btn w-full py-3.5 disabled:opacity-60 inline-flex items-center justify-center gap-2"
              >
                {status === 'loading' ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <Smartphone size={16} />
                )}
                {status === 'loading' ? 'Looking up your session…' : 'Reconnect'}
              </motion.button>
            </div>
          )}

          <AnimatePresence>
            {status === 'code' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="glass-card rounded-2xl p-6 text-center"
              >
                <p className="body-text mb-4">
                  Open WhatsApp → Linked Devices → Link with phone number, and enter this code:
                </p>
                <div className="flex items-center justify-center gap-2 mb-5">
                  <span className="font-display font-bold text-2xl tracking-[0.2em] text-[#1a1a1a] bg-white/80 border border-black/[0.06] rounded-xl px-5 py-3">
                    {code}
                  </span>
                  <button
                    onClick={copyCode}
                    className="w-11 h-11 rounded-xl bg-white/80 border border-black/[0.06] flex items-center justify-center hover:bg-white transition"
                    aria-label="Copy code"
                  >
                    {copied ? <CheckCircle2 size={16} className="text-[#00A884]" /> : <Copy size={16} className="text-[#1a1a1a]" />}
                  </button>
                </div>
                <p className="text-xs text-[#8e8e8e] inline-flex items-center gap-1.5">
                  <RefreshCw size={12} className="animate-spin" /> Waiting for connection…
                </p>
              </motion.div>
            )}

            {status === 'already' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="glass-card rounded-2xl p-6 text-center"
              >
                <CheckCircle2 className="mx-auto mb-3 text-[#00A884]" size={32} />
                <h3 className="heading-md text-[#1a1a1a] mb-1">Already online</h3>
                <p className="body-text">Your bot ({sessionId}) is already connected — nothing to do.</p>
              </motion.div>
            )}

            {status === 'connected' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="glass-card rounded-2xl p-6 text-center"
              >
                <CheckCircle2 className="mx-auto mb-3 text-[#00A884]" size={32} />
                <h3 className="heading-md text-[#1a1a1a] mb-1">Reconnected!</h3>
                <p className="body-text">Your bot is back online. Type <code>.help</code> in WhatsApp to confirm.</p>
              </motion.div>
            )}
          </AnimatePresence>

          {status !== 'idle' && status !== 'loading' && (
            <button
              onClick={reset}
              className="mt-4 text-xs text-[#8e8e8e] hover:text-[#1a1a1a] transition-colors w-full text-center"
            >
              Try a different number
            </button>
          )}
        </div>
      </main>
    </div>
  )
}
