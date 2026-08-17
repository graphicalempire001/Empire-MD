import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Smartphone,
  Bot,
  Loader2,
  CheckCircle2,
  Copy,
  X,
  RefreshCw,
  QrCode,
  KeyRound,
  Crown,
  Zap,
} from 'lucide-react'

interface PairingFlowProps {
  open: boolean
  onClose: () => void
  initialPhone?: string
}

type Step = 1 | 2 | 3
type PairingFormat = 'code' | 'qr'
type Plan = 'free' | 'premium'

const PREMIUM_BASE = 1500
const MONTH_OPTIONS = [1, 2, 3, 6] as const

function round50(n: number) {
  return Math.round(n / 50) * 50
}

/** Same formula as lib/premium.js — geometric 5% discount */
function calcPlanPrice(months: number) {
  const n = Math.max(1, Math.round(months || 1))
  const naive = n * PREMIUM_BASE
  const multiplier = Math.pow(0.95, n - 1)
  const price = round50(naive * multiplier)
  const savings = naive - price
  return { months: n, naive, price, savings }
}

function formatNaira(n: number) {
  return `₦${n.toLocaleString('en-NG')}`
}

export default function PairingFlow({ open, onClose, initialPhone }: PairingFlowProps) {
  const [step, setStep] = useState<Step>(1)
  const [pairingFormat, setPairingFormat] = useState<PairingFormat>('code')
  const [plan, setPlan] = useState<Plan>('free')
  const [months, setMonths] = useState<number>(1)

  const [botName, setBotName] = useState('')
  const [phone, setPhone] = useState(initialPhone || '')

  useEffect(() => {
    if (open && initialPhone) setPhone(initialPhone)
  }, [open, initialPhone])

  const [sessionId, setSessionId] = useState('')
  const [pairingCode, setPairingCode] = useState('')
  const [qrCode, setQrCode] = useState('')
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

  const [loading, setLoading] = useState(false)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const paymentPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const stopPaymentPolling = useCallback(() => {
    if (paymentPollRef.current) {
      clearInterval(paymentPollRef.current)
      paymentPollRef.current = null
    }
  }, [])

  const resetAll = useCallback(() => {
    stopPolling()
    stopPaymentPolling()
    setStep(1)
    setPairingFormat('code')
    setPlan('free')
    setMonths(1)
    setBotName('')
    setPhone('')
    setSessionId('')
    setPairingCode('')
    setQrCode('')
    setSecondsLeft(null)
    setLoading(false)
    setPaying(false)
    setError('')
    setCopied(false)
  }, [stopPolling, stopPaymentPolling])

  const handleClose = () => {
    resetAll()
    onClose()
  }

  useEffect(() => {
    if (!open) resetAll()
  }, [open, resetAll])

  useEffect(
    () => () => {
      stopPolling()
      stopPaymentPolling()
    },
    [stopPolling, stopPaymentPolling]
  )

  const startConnection = async (chosenPlan: Plan = plan) => {
    setError('')
    if (!botName.trim()) {
      setError('Please enter a bot name.')
      return
    }
    if (
      pairingFormat === 'code' &&
      !/^[1-9][0-9]{7,14}$/.test(phone.replace(/[^0-9]/g, ''))
    ) {
      setError(
        'Enter a valid number with country code, no + or spaces. E.g. 1234567890'
      )
      return
    }

    setLoading(true)
    try {
      const endpoint =
        pairingFormat === 'code' ? '/api/connect' : '/api/qr-connect'
      const body =
        pairingFormat === 'code'
          ? {
              botName: botName.trim(),
              phoneNumber: phone.replace(/[^0-9]/g, ''),
              plan: chosenPlan,
              months: chosenPlan === 'premium' ? months : 1,
            }
          : {
              botName: botName.trim(),
              plan: chosenPlan,
              months: chosenPlan === 'premium' ? months : 1,
            }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()

      if (!data.success) {
        setError(data.error || 'Connection unavailable. Please try again.')
        setLoading(false)
        return
      }

      setSessionId(data.sessionId)
      setStep(2)
      startPolling(data.sessionId)
    } catch {
      setError(
        'Server is currently been activated by team. Deploy / retry by 8PM.'
      )
    } finally {
      setLoading(false)
    }
  }

  const startPremiumCheckout = async () => {
    setError('')
    if (!botName.trim()) {
      setError('Please enter a bot name first.')
      return
    }
    if (
      pairingFormat === 'code' &&
      !/^[1-9][0-9]{7,14}$/.test(phone.replace(/[^0-9]/g, ''))
    ) {
      setError(
        'Enter a valid number with country code, no + or spaces. E.g. 2348142656848'
      )
      return
    }

    const tier = calcPlanPrice(months)
    setPaying(true)

    try {
      const cleanPhone = phone.replace(/[^0-9]/g, '')
      const res = await fetch('/api/payment/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: tier.price,
          phone: cleanPhone || undefined,
          botName: botName.trim(),
          email: `${cleanPhone || 'user'}@empirebot.space`,
          plan: 'premium',
          months: tier.months,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        setError(
          data.error ||
            'Payment service not added wait, or choose Free for now.'
        )
        setPaying(false)
        return
      }

      const checkoutUrl =
        data.link || data.authorization_url || data.checkout_url
      if (checkoutUrl) {
        window.open(checkoutUrl, '_blank', 'noopener,noreferrer')
      }

      const reference = data.reference
      if (!reference) {
        setError('No payment reference returned. Contact support.')
        setPaying(false)
        return
      }

      stopPaymentPolling()
      let attempts = 0
      paymentPollRef.current = setInterval(async () => {
        attempts += 1
        if (attempts > 60) {
          stopPaymentPolling()
          setPaying(false)
          setError(
            'Payment timed out. If you already paid, contact support with your reference.'
          )
          return
        }
        try {
          const st = await fetch(
            `/api/payment/status/${encodeURIComponent(reference)}`
          )
          const stData = await st.json()
          if (stData.success && (stData.paid || stData.status === 'success' || stData.status === 'successful')) {
            stopPaymentPolling()
            setPaying(false)
            await startConnection('premium')
          }
        } catch {
          /* keep polling */
        }
      }, 3000)
    } catch {
      setError(
        'Could not pay now. Try again later.'
      )
      setPaying(false)
    }
  }

  const handleContinue = () => {
    if (plan === 'premium') {
      startPremiumCheckout()
    } else {
      startConnection('free')
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
        /* transient */
      }
    }, 3000)
  }

  const startOver = () => {
    stopPolling()
    stopPaymentPolling()
    setStep(1)
    setPairingCode('')
    setQrCode('')
    setSecondsLeft(null)
    setSessionId('')
    setError('')
    setPaying(false)
  }

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  const tier = calcPlanPrice(months)

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && handleClose()}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="relative w-full max-w-md rounded-3xl bg-[#EDEEF5] shadow-2xl overflow-hidden border border-black/[0.06]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.05]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#00A884]/15 flex items-center justify-center">
                  <Smartphone size={16} className="text-[#00A884]" />
                </div>
                <div>
                  <div className="text-sm font-bold text-[#1a1a1a]">Get Your Bot</div>
                  <div className="text-[11px] text-[#8e8e8e]">
                    Step {step} of 3
                    {plan === 'premium' && step === 1
                      ? ` · Premium · ${months} mo`
                      : ''}
                  </div>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-1.5 rounded-full hover:bg-black/[0.05] transition"
                aria-label="Close"
              >
                <X size={18} className="text-[#8e8e8e]" />
              </button>
            </div>

            <div className="px-5 py-5 max-h-[min(78vh,640px)] overflow-y-auto">
              {/* STEP 1 */}
              {step === 1 && (
                <div>
                  <h3 className="font-display font-bold text-lg text-[#1a1a1a] mb-1">
                    Launch your WhatsApp bot
                  </h3>
                  <p className="text-sm text-[#8e8e8e] mb-5">
                    Enter details, choose a plan, then connect in 1 minute.
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
                  </label>

                  {/* Phone */}
                  {pairingFormat === 'code' && (
                    <label className="block mb-5">
                      <span className="text-xs font-semibold text-[#1a1a1a]">
                        WhatsApp Number
                      </span>
                      <div className="mt-1 flex items-center bg-white/80 border border-black/[0.06] rounded-xl px-3 focus-within:ring-2 focus-within:ring-[#00A884]/30 focus-within:border-[#00A884] transition">
                        <Smartphone size={16} className="text-[#8e8e8e] shrink-0" />
                        <input
                          value={phone}
                          onChange={(e) =>
                            setPhone(e.target.value.replace(/[^0-9]/g, ''))
                          }
                          placeholder="2348012345678"
                          className="flex-1 bg-transparent px-3 py-3 text-sm text-[#1a1a1a] placeholder:text-[#b0b0b8] outline-none"
                        />
                      </div>
                      <span className="text-[11px] text-[#8e8e8e]">
                        Country code, no + or spaces
                      </span>
                    </label>
                  )}

                  {/* Plan selection */}
                  <div className="mb-5">
                    <span className="text-xs font-semibold text-[#1a1a1a] block mb-2">
                      Choose plan
                    </span>
                    <div className="grid grid-cols-2 gap-2.5 mb-3">
                      <button
                        type="button"
                        onClick={() => setPlan('free')}
                        className={`text-left rounded-2xl border p-3.5 transition-all ${
                          plan === 'free'
                            ? 'border-[#00A884] bg-[#00A884]/8 shadow-sm'
                            : 'border-black/[0.06] bg-white/70 hover:border-black/10'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <Zap size={14} className="text-[#00A884]" />
                          <span className="text-xs font-bold text-[#1a1a1a]">Free</span>
                        </div>
                        <div className="text-lg font-black text-[#1a1a1a]">₦0</div>
                        <p className="text-[10px] text-[#8e8e8e] mt-1 leading-snug">
                          Media, stickers, groups, AI. Core features.
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPlan('premium')}
                        className={`text-left rounded-2xl border p-3.5 transition-all relative ${
                          plan === 'premium'
                            ? 'border-[#00A884] bg-[#00A884]/8 shadow-sm'
                            : 'border-black/[0.06] bg-white/70 hover:border-black/10'
                        }`}
                      >
                        <span className="absolute -top-2 right-2 text-[9px] font-bold uppercase tracking-wide bg-[#1a1a1a] text-white px-1.5 py-0.5 rounded-full">
                          Popular
                        </span>
                        <div className="flex items-center gap-1.5 mb-1">
                          <Crown size={14} className="text-amber-500" />
                          <span className="text-xs font-bold text-[#1a1a1a]">Premium</span>
                        </div>
                        <div className="text-lg font-black text-[#1a1a1a]">
                          {formatNaira(tier.price)}
                        </div>
                        <p className="text-[10px] text-[#8e8e8e] mt-1 leading-snug">
                          Ghost mode, save view-once, anti-delete, PDF, MsDoc, Ms Excel, antibot & more.
                        </p>
                      </button>
                    </div>

                    {/* Duration — Premium only */}
                    {plan === 'premium' && (
                      <div className="rounded-2xl border border-black/[0.06] bg-white/80 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-semibold text-[#1a1a1a]">
                            Subscribe for
                          </span>
                          {tier.savings > 0 && (
                            <span className="text-[10px] font-bold text-[#00A884]">
                              Save {formatNaira(tier.savings)}
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-4 gap-1.5">
                          {MONTH_OPTIONS.map((m) => {
                            const t = calcPlanPrice(m)
                            const active = months === m
                            return (
                              <button
                                key={m}
                                type="button"
                                onClick={() => setMonths(m)}
                                className={`rounded-xl py-2 px-1 text-center transition-all border ${
                                  active
                                    ? 'border-[#00A884] bg-[#00A884]/10 shadow-sm'
                                    : 'border-transparent bg-black/[0.03] hover:bg-black/[0.05]'
                                }`}
                              >
                                <div
                                  className={`text-xs font-bold ${
                                    active ? 'text-[#00A884]' : 'text-[#1a1a1a]'
                                  }`}
                                >
                                  {m} mo
                                </div>
                                <div className="text-[10px] text-[#8e8e8e] mt-0.5 leading-tight">
                                  {formatNaira(t.price)}
                                </div>
                                {t.savings > 0 && (
                                  <div className="text-[9px] font-semibold text-[#00A884] mt-0.5">
                                    −{Math.round((t.savings / t.naive) * 100)}%
                                  </div>
                                )}
                              </button>
                            )
                          })}
                        </div>

                        <p className="mt-2 text-[10px] text-[#8e8e8e] leading-snug">
                          {months === 1
                            ? 'Billed once for 30 days.'
                            : `Pay ${formatNaira(tier.price)} once instead of ${formatNaira(
                                tier.naive
                              )} if paid monthly. Longer plans unlock more discount.`}
                        </p>
                      </div>
                    )}
                  </div>

                  {error && (
                    <p className="mb-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                      {error}
                    </p>
                  )}

                  <button
                    onClick={handleContinue}
                    disabled={loading || paying}
                    className="whatsapp-btn w-full text-sm py-3.5 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {(loading || paying) && (
                      <Loader2 size={16} className="animate-spin" />
                    )}
                    {paying
                      ? 'Waiting for payment…'
                      : loading
                        ? 'Starting…'
                        : plan === 'premium'
                          ? `Pay ${formatNaira(tier.price)} & Continue`
                          : 'Continue Free'}
                  </button>

                  {plan === 'premium' && (
                    <p className="mt-2 text-[10px] text-center text-[#8e8e8e]">
                      Secure checkout. Pairing starts after payment
                      is confirmed.
                    </p>
                  )}
                </div>
              )}

              {/* STEP 2 */}
              {step === 2 && (
                <div className="text-center">
                  <h3 className="font-display font-bold text-lg text-[#1a1a1a] mb-1">
                    {pairingFormat === 'code' ? 'Enter pairing code' : 'Scan QR code'}
                  </h3>
                  <p className="text-sm text-[#8e8e8e] mb-5">
                    {pairingFormat === 'code'
                      ? 'WhatsApp → Linked Devices → Link with phone number'
                      : 'WhatsApp → Linked Devices → Link a Device'}
                  </p>

                  {pairingFormat === 'code' ? (
                    <>
                      {pairingCode ? (
                        <div
                          onClick={() => copy(pairingCode)}
                          className="cursor-pointer mx-auto mb-3 max-w-xs bg-white border border-black/[0.06] rounded-2xl px-4 py-5 shadow-sm"
                        >
                          <div className="text-2xl font-black tracking-[0.2em] text-[#1a1a1a]">
                            {pairingCode}
                          </div>
                          <div className="mt-2 text-[11px] text-[#8e8e8e] flex items-center justify-center gap-1">
                            {copied ? (
                              <>
                                <CheckCircle2 size={12} className="text-[#00A884]" />{' '}
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy size={12} /> Tap to copy
                              </>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-center py-8">
                          <Loader2 size={26} className="animate-spin text-[#8e8e8e]" />
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {qrCode ? (
                        <img
                          src={qrCode}
                          alt="QR Code"
                          className="mx-auto mb-3 w-48 h-48 rounded-xl border border-black/[0.06] bg-white"
                        />
                      ) : (
                        <div className="flex justify-center py-8">
                          <Loader2 size={26} className="animate-spin text-[#8e8e8e]" />
                        </div>
                      )}
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

              {/* STEP 3 */}
              {step === 3 && (
                <div className="text-center">
                  <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-[#00A884]/15 flex items-center justify-center">
                    <CheckCircle2 size={30} className="text-[#00A884]" />
                  </div>
                  <h3 className="font-display font-bold text-xl text-[#1a1a1a] mb-2">
                    🎉 Your Bot Is Live!
                  </h3>
                  <p className="text-sm text-[#8e8e8e] mb-5">
                    Check your WhatsApp DM — a welcome message was just sent to you.
                    {plan === 'premium' &&
                      ` Premium active for \( {months} month \){months > 1 ? 's' : ''}.`}
                  </p>

                  <div
                    onClick={() => copy(sessionId)}
                    className="cursor-pointer bg-white/70 border border-black/[0.06] rounded-xl px-4 py-3 flex items-center justify-between gap-3 mb-2"
                  >
                    <code className="text-xs text-[#1a1a1a] truncate">{sessionId}</code>
                    {copied ? (
                      <CheckCircle2 size={16} className="text-[#00A884] shrink-0" />
                    ) : (
                      <Copy size={16} className="text-[#8e8e8e] shrink-0" />
                    )}
                  </div>
                  {copied && (
                    <p className="text-[11px] text-[#00A884] mb-2">
                      ✅ Session ID copied to clipboard!
                    </p>
                  )}

                  <p className="text-[11px] text-[#8e8e8e] mb-5">
                    ⚠️ Keep your Session ID private — it&apos;s your bot&apos;s identity.
                  </p>

                  <button
                    onClick={handleClose}
                    className="whatsapp-btn w-full text-sm py-3.5 rounded-2xl"
                  >
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
