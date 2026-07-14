import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Smartphone, Bot, Loader2, CheckCircle2, Copy, X, RefreshCw, QrCode, KeyRound } from 'lucide-react'

interface PairingFlowProps {
  open: boolean
  onClose: () => void
}

type Step = 1 | 2 | 3
type PairingFormat = 'code' | 'qr'

export default function PairingFlow({ open, onClose }: PairingFlowProps) {
  const [step, setStep] = useState<Step>(1)
  const [pairingFormat, setPairingFormat] = useState<PairingFormat>('code')

  const [botName, setBotName] = useState('')
  const [phone, setPhone] = useState('')

  const [sessionId, setSessionId] = useState('')
  const [pairingCode, setPairingCode] = useState('')
  const [qrCode, setQrCode] = useState('')
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const resetAll = useCallback(() => {
    stopPolling()
    setStep(1)
    setPairingFormat('code')
    setBotName('')
    setPhone('')
    setSessionId('')
    setPairingCode('')
    setQrCode('')
    setSecondsLeft(null)
    setLoading(false)
    setError('')
    setCopied(false)
  }, [stopPolling])

  const handleClose = () => {
    resetAll()
    onClose()
  }

  // Reset when the modal is closed from outside
  useEffect(() => {
    if (!open) resetAll()
  }, [open, resetAll])

  // Cleanup polling on unmount
  useEffect(() => () => stopPolling(), [stopPolling])

  const startConnection = async () => {
    setError('')
    if (!botName.trim()) {
      setError('Please enter a bot name.')
      return
    }
    if (pairingFormat === 'code' && !/^[1-9][0-9]{7,14}$/.test(phone.replace(/[^0-9]/g, ''))) {
      setError('Enter a valid number with country code, no + or spaces. E.g. 2348012345678')
      return
    }

    setLoading(true)
    try {
      const endpoint = pairingFormat === 'code' ? '/api/connect' : '/api/qr-connect'
      const body =
        pairingFormat === 'code'
          ? { botName: botName.trim(), phoneNumber: phone.replace(/[^0-9]/g, '') }
          : { botName: botName.trim() }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()

      if (!data.success) {
        setError(data.error || 'Connection failed. Please try again.')
        setLoading(false)
        return
      }

      setSessionId(data.sessionId)
      setStep(2)
      startPolling(data.sessionId)
    } catch {
      setError('Server unreachable. Check your connection and retry.')
    } finally {
      setLoading(false)
    }
  }

  const startPolling = (sid: string) => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/status/${sid}`)
        const data = await res.json()

        if (data.pairingCode) setPairingCode(data.pairingCode)
        if (data.qr) setQrCode(data.qr)
        if (typeof data.secondsLeft === 'number') setSecondsLeft(data.secondsLeft)

        if (data.status === 'connected') {
          stopPolling()
          setStep(3)
        } else if (data.status === 'error') {
          stopPolling()
          setError(data.error || 'Pairing error.')
          setStep(1)
        } else if (data.status === 'expired') {
          stopPolling()
          setError('Session expired. Please restart.')
          setStep(1)
        }
      } catch {
        /* transient — keep polling */
      }
    }, 3000)
  }

  const startOver = () => {
    stopPolling()
    setStep(1)
    setPairingCode('')
    setQrCode('')
    setSecondsLeft(null)
    setSessionId('')
    setError('')
  }

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-[#0d0d12]/40 backdrop-blur-md" />

          {/* Glass card */}
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md rounded-3xl border border-white/40 bg-white/70 backdrop-blur-2xl shadow-2xl shadow-[#00A884]/10 p-7 md:p-8 overflow-hidden"
          >
            {/* Soft green glow accents */}
            <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full bg-[#00A884]/20 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-16 -left-16 w-40 h-40 rounded-full bg-[#9fff00]/15 blur-3xl pointer-events-none" />

            {/* Close */}
            <button
              onClick={handleClose}
              aria-label="Close"
              className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full flex items-center justify-center text-[#1a1a1a]/60 hover:text-[#1a1a1a] hover:bg-black/5 transition-colors"
            >
              <X size={18} />
            </button>

            {/* Progress bar */}
            <div className="relative flex gap-1.5 mb-6">
              {[1, 2, 3].map((s) => (
                <div
                  key={s}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    step >= (s as Step) ? 'bg-gradient-green' : 'bg-black/[0.08]'
                  }`}
                />
              ))}
            </div>

            <div className="relative">
              {/* STEP 1 — FORM */}
              {step === 1 && (
                <div>
                  <h3 className="font-display font-bold text-xl text-[#1a1a1a] mb-1">Connect Your WhatsApp</h3>
                  <p className="text-sm text-[#8e8e8e] mb-5">
                    Enter your details to get your personal connection.
                  </p>

                  {/* Format toggle */}
                  <div className="flex p-1 mb-5 rounded-2xl bg-black/[0.04] border border-black/[0.05]">
                    <button
                      type="button"
                      onClick={() => setPairingFormat('code')}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                        pairingFormat === 'code'
                          ? 'bg-white text-[#1a1a1a] shadow-sm'
                          : 'text-[#8e8e8e] hover:text-[#1a1a1a]'
                      }`}
                    >
                      <KeyRound size={14} /> Pairing Code
                    </button>
                    <button
                      type="button"
                      onClick={() => setPairingFormat('qr')}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                        pairingFormat === 'qr'
                          ? 'bg-white text-[#1a1a1a] shadow-sm'
                          : 'text-[#8e8e8e] hover:text-[#1a1a1a]'
                      }`}
                    >
                      <QrCode size={14} /> QR Code
                    </button>
                  </div>

                  {/* Bot name */}
                  <label className="block mb-4">
                    <span className="text-xs font-semibold text-[#1a1a1a]">Bot Name</span>
                    <div className="mt-1 flex items-center bg-white/80 border border-black/[0.06] rounded-xl px-3 focus-within:ring-2 focus-within:ring-[#00A884]/30 focus-within:border-[#00A884] transition">
                      <Bot size={16} className="text-[#8e8e8e] shrink-0" />
                      <input
                        value={botName}
                        maxLength={30}
                        onChange={(e) => setBotName(e.target.value)}
                        placeholder="e.g. Empire Assistant"
                        className="flex-1 bg-transparent px-3 py-3 text-sm text-[#1a1a1a] placeholder:text-[#b0b0b8] outline-none"
                      />
                    </div>
                    <span className="text-[11px] text-[#8e8e8e]">This will be your bot's display name. Max 30 chars.</span>
                  </label>

                  {/* Phone (code only) */}
                  {pairingFormat === 'code' && (
                    <label className="block mb-4">
                      <span className="text-xs font-semibold text-[#1a1a1a]">Phone Number</span>
                      <div className="mt-1 flex items-center bg-white/80 border border-black/[0.06] rounded-xl px-3 focus-within:ring-2 focus-within:ring-[#00A884]/30 focus-within:border-[#00A884] transition">
                        <Smartphone size={16} className="text-[#8e8e8e] shrink-0" />
                        <span className="text-sm text-[#8e8e8e] pl-2">+</span>
                        <input
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="2348012345678"
                          className="flex-1 bg-transparent px-2 py-3 text-sm text-[#1a1a1a] placeholder:text-[#b0b0b8] outline-none"
                        />
                      </div>
                      <span className="text-[11px] text-[#8e8e8e]">Include country code. No spaces or dashes.</span>
                    </label>
                  )}

                  {error && (
                    <div className="mb-4 text-xs text-red-600 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                      {error}
                    </div>
                  )}

                  <button
                    onClick={startConnection}
                    disabled={loading}
                    className="whatsapp-btn w-full flex items-center justify-center gap-2 text-sm py-3.5 rounded-2xl disabled:opacity-60"
                  >
                    {loading ? (
                      <>
                        <Loader2 size={16} className="animate-spin" /> Connecting…
                      </>
                    ) : pairingFormat === 'code' ? (
                      'Get Pairing Code'
                    ) : (
                      'Generate QR Code'
                    )}
                  </button>

                  <p className="text-[11px] text-[#8e8e8e] text-center mt-4">
                    Your number is never stored publicly. This is your own personal bot connection.
                  </p>
                </div>
              )}

              {/* STEP 2 — PAIRING / QR */}
              {step === 2 && (
                <div className="text-center">
                  <div className="mx-auto mb-4 w-12 h-12 rounded-2xl bg-gradient-green flex items-center justify-center text-white">
                    {pairingFormat === 'code' ? <KeyRound size={22} /> : <QrCode size={22} />}
                  </div>
                  <h3 className="font-display font-bold text-xl text-[#1a1a1a] mb-2">
                    {pairingFormat === 'code' ? 'Enter Pairing Code' : 'Scan QR Code'}
                  </h3>

                  {pairingFormat === 'code' ? (
                    <>
                      <p className="text-xs text-[#8e8e8e] mb-4 leading-relaxed">
                        Open WhatsApp → <strong>Linked Devices</strong> → <strong>Link a Device</strong> →{' '}
                        <strong>Link with phone number instead</strong>
                      </p>
                      <div className="flex items-center justify-center gap-2 mb-4">
                        <div className="font-mono font-bold text-2xl tracking-[0.25em] text-[#1a1a1a] bg-white/70 border border-black/[0.06] rounded-2xl px-5 py-4">
                          {pairingCode || '···· ····'}
                        </div>
                        {pairingCode && (
                          <button
                            onClick={() => copy(pairingCode)}
                            className="w-11 h-11 rounded-xl bg-black/[0.04] hover:bg-black/[0.08] flex items-center justify-center transition-colors"
                          >
                            {copied ? <CheckCircle2 size={18} className="text-[#00A884]" /> : <Copy size={18} className="text-[#1a1a1a]" />}
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-[#8e8e8e] mb-4 leading-relaxed">
                        Open WhatsApp → <strong>Linked Devices</strong> → <strong>Link a Device</strong> and point your
                        phone's camera at this screen.
                      </p>
                      <div className="mx-auto mb-4 w-[180px] h-[180px] rounded-2xl bg-white border border-black/[0.06] flex items-center justify-center overflow-hidden">
                        {qrCode ? (
                          <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrCode)}`}
                            alt="WhatsApp QR Code"
                            className="w-full h-full"
                          />
                        ) : (
                          <Loader2 size={26} className="animate-spin text-[#8e8e8e]" />
                        )}
                      </div>
                    </>
                  )}

                  <p className="text-xs text-[#8e8e8e]">
                    Waiting for WhatsApp to confirm
                    {secondsLeft != null ? ` · ${secondsLeft}s expires` : ''}
                  </p>

                  {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

                  <button
                    onClick={startOver}
                    className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#8e8e8e] hover:text-[#1a1a1a] transition-colors"
                  >
                    <RefreshCw size={14} /> Start over
                  </button>
                </div>
              )}

              {/* STEP 3 — SUCCESS */}
              {step === 3 && (
                <div className="text-center">
                  <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-[#00A884]/15 flex items-center justify-center">
                    <CheckCircle2 size={30} className="text-[#00A884]" />
                  </div>
                  <h3 className="font-display font-bold text-xl text-[#1a1a1a] mb-2">🎉 Your Bot Is Live!</h3>
                  <p className="text-sm text-[#8e8e8e] mb-5">
                    Check your WhatsApp DM — a welcome message was just sent to you.
                  </p>

                  <div
                    onClick={() => copy(sessionId)}
                    className="cursor-pointer bg-white/70 border border-black/[0.06] rounded-xl px-4 py-3 flex items-center justify-between gap-3 mb-2"
                  >
                    <code className="text-xs text-[#1a1a1a] truncate">{sessionId}</code>
                    {copied ? <CheckCircle2 size={16} className="text-[#00A884] shrink-0" /> : <Copy size={16} className="text-[#8e8e8e] shrink-0" />}
                  </div>
                  {copied && <p className="text-[11px] text-[#00A884] mb-2">✅ Session ID copied to clipboard!</p>}

                  <p className="text-[11px] text-[#8e8e8e] mb-5">⚠️ Keep your Session ID private — it's your bot's identity.</p>

                  <button onClick={handleClose} className="whatsapp-btn w-full text-sm py-3.5 rounded-2xl">
                    Done
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
