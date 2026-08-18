import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router'

declare global {
  interface Window {
    FlutterwaveCheckout?: (opts: Record<string, unknown>) => void
  }
}

const FLW_SCRIPT_SRC = 'https://checkout.flutterwave.com/v3.js'
const FLW_PUBLIC_KEY = (import.meta.env.VITE_FLW_PUBLIC_KEY as string | undefined)?.trim()

// Class price (fixed, not subscription)
const CLASS_PRICES = {
  NGN: { code: 'NGN', country: 'Nigeria', symbol: '₦', amount: 1000, paymentOptions: 'banktransfer,ussd,card,mobilemoney' },
  GHS: { code: 'GHS', country: 'Ghana', symbol: 'GH₵', amount: 10, paymentOptions: 'mobilemoneyghana,card' },
  XAF: { code: 'XAF', country: 'Cameroon', symbol: 'FCFA', amount: 400, paymentOptions: 'mobilemoneyfranco,card' },
} as const

type CurrencyCode = keyof typeof CLASS_PRICES

const TARGET_DATE = new Date('2026-08-20T20:00:00+01:00') // 8pm WAT
const WHATSAPP_NUMBER = '2348142646848'
const POLL_VOTES = 137 // "over 130"

function loadFlutterwaveScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.FlutterwaveCheckout) return resolve()
    const existing = document.querySelector(`script[src="${FLW_SCRIPT_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('Failed to load payment SDK')))
      return
    }
    const script = document.createElement('script')
    script.src = FLW_SCRIPT_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load payment SDK'))
    document.body.appendChild(script)
  })
}

function generateSerial(): string {
  const prefix = 'RTC'
  const ts = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase()
  return `${prefix}-${ts}-${rand}`
}

function Countdown() {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })

  useEffect(() => {
    const tick = () => {
      const now = new Date().getTime()
      const distance = TARGET_DATE.getTime() - now
      if (distance <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 })
        return
      }
      setTimeLeft({
        days: Math.floor(distance / (1000 * 60 * 60 * 24)),
        hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((distance % (1000 * 60)) / 1000),
      })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const units = [
    { label: 'Days', value: timeLeft.days },
    { label: 'Hours', value: timeLeft.hours },
    { label: 'Mins', value: timeLeft.minutes },
    { label: 'Secs', value: timeLeft.seconds },
  ]

  return (
    <div className="flex justify-center gap-3 sm:gap-4 md:gap-6">
      {units.map((u) => (
        <div
          key={u.label}
          className="relative flex flex-col items-center justify-center w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-2xl bg-black/80 border border-[#9fff00]/30 shadow-[0_0_30px_rgba(159,255,0,0.15)] overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-b from-[#9fff00]/10 to-transparent pointer-events-none" />
          <span className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-[#9fff00] tabular-nums leading-none">
            {String(u.value).padStart(2, '0')}
          </span>
          <span className="text-[10px] sm:text-xs uppercase tracking-widest text-white/50 mt-1">
            {u.label}
          </span>
        </div>
      ))}
    </div>
  )
}

function AnimatedPoll() {
  const [displayVotes, setDisplayVotes] = useState(0)
  const [barWidth, setBarWidth] = useState(0)

  useEffect(() => {
    const duration = 2200
    const start = performance.now()
    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const ease = 1 - Math.pow(1 - progress, 3)
      setDisplayVotes(Math.floor(ease * POLL_VOTES))
      setBarWidth(ease * 92) // 92% visual fill
      if (progress < 1) requestAnimationFrame(animate)
    }
    const id = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-white/80">WhatsApp Class</span>
        <span className="text-sm font-bold text-[#9fff00] tabular-nums">{displayVotes}+ votes</span>
      </div>
      <div className="h-3 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#00A884] to-[#9fff00] transition-all duration-75 ease-out relative"
          style={{ width: `${barWidth}%` }}
        >
          <div className="absolute inset-0 bg-white/20 animate-pulse" />
        </div>
      </div>
      <p className="text-xs text-white/40 mt-2 text-center">
        Over 130 people already chose WhatsApp for the class
      </p>
    </div>
  )
}

function ThumbprintButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group relative flex flex-col items-center gap-3 focus:outline-none"
      aria-label="Join the class now"
    >
      <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-gradient-to-br from-[#9fff00]/20 to-[#00A884]/10 border-2 border-[#9fff00]/50 flex items-center justify-center transition-all duration-300 group-hover:scale-105 group-hover:border-[#9fff00] group-hover:shadow-[0_0_40px_rgba(159,255,0,0.35)]">
        {/* Fingerprint SVG */}
        <svg
          viewBox="0 0 64 64"
          className="w-16 h-16 sm:w-20 sm:h-20 text-[#9fff00] opacity-90 group-hover:opacity-100 transition-opacity"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <path d="M32 8c-8 0-14 6-14 14v8c0 2 1 4 2 5" />
          <path d="M32 8c8 0 14 6 14 14v6c0 3-1 5-3 7" />
          <path d="M20 30c0 8 4 14 10 18" />
          <path d="M44 28c0 10-6 18-14 22" />
          <path d="M24 38c2 6 6 10 10 12" />
          <path d="M40 36c-2 7-6 12-12 14" />
          <path d="M28 46c2 3 4 5 6 6" />
          <path d="M36 44c-1 3-3 5-6 6" />
          <circle cx="32" cy="32" r="3" fill="currentColor" opacity="0.6" />
        </svg>
        {/* Pulse rings */}
        <span className="absolute inset-0 rounded-full border border-[#9fff00]/40 animate-ping opacity-30" />
        <span className="absolute inset-[-6px] rounded-full border border-[#9fff00]/20 animate-pulse" />
      </div>
      <span className="text-sm font-semibold text-[#9fff00] tracking-wide group-hover:text-white transition-colors">
        Join the class now
      </span>
    </button>
  )
}

function Confetti({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!active || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const particles: {
      x: number
      y: number
      vx: number
      vy: number
      color: string
      size: number
      life: number
    }[] = []

    const colors = ['#9fff00', '#00A884', '#FFD23F', '#ffffff', '#C6FF3D']

    for (let i = 0; i < 120; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * 100,
        vx: (Math.random() - 0.5) * 8,
        vy: 2 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 4 + Math.random() * 6,
        life: 1,
      })
    }

    let frame: number
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      let alive = false
      for (const p of particles) {
        if (p.life <= 0) continue
        alive = true
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.12
        p.life -= 0.008
        ctx.globalAlpha = Math.max(0, p.life)
        ctx.fillStyle = p.color
        ctx.fillRect(p.x, p.y, p.size, p.size * 0.6)
      }
      ctx.globalAlpha = 1
      if (alive) frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [active])

  if (!active) return null
  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[100]"
      style={{ width: '100%', height: '100%' }}
    />
  )
}

type ModalState =
  | 'closed'
  | 'invite'
  | 'no-money'
  | 'miss-countdown'
  | 'miss-final'
  | 'paying'
  | 'success'

export default function ClassPage() {
  const [modal, setModal] = useState<ModalState>('closed')
  const [currency, setCurrency] = useState<CurrencyCode>('NGN')
  const [scriptReady, setScriptReady] = useState(false)
  const [missSeconds, setMissSeconds] = useState(3)
  const [successSerial, setSuccessSerial] = useState('')
  const [redirectSeconds, setRedirectSeconds] = useState(5)
  const [showConfetti, setShowConfetti] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    loadFlutterwaveScript()
      .then(() => setScriptReady(true))
      .catch(() => setErrorMsg('Could not load payment. Check connection.'))
  }, [])

  // Miss countdown
  useEffect(() => {
    if (modal !== 'miss-countdown') return
    setMissSeconds(3)
    const id = setInterval(() => {
      setMissSeconds((s) => {
        if (s <= 1) {
          clearInterval(id)
          setModal('miss-final')
          setShowConfetti(true)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [modal])

  // Success redirect countdown
  useEffect(() => {
    if (modal !== 'success') return
    setRedirectSeconds(5)
    const id = setInterval(() => {
      setRedirectSeconds((s) => {
        if (s <= 1) {
          clearInterval(id)
          const msg = encodeURIComponent(
            `Hi! I just paid for the Robot Training Class.\nSerial: ${successSerial}\nPlease add me to the class.`
          )
          window.location.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [modal, successSerial])

  const startPayment = useCallback(() => {
    if (!FLW_PUBLIC_KEY) {
      setErrorMsg('Payments are not configured yet. Contact support.')
      return
    }
    if (!scriptReady || !window.FlutterwaveCheckout) {
      setErrorMsg('Payment still loading — try again in a moment.')
      return
    }

    const cfg = CLASS_PRICES[currency]
    const tx_ref = `RTC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setModal('paying')
    setErrorMsg('')

    window.FlutterwaveCheckout({
      public_key: FLW_PUBLIC_KEY,
      tx_ref,
      amount: cfg.amount,
      currency: cfg.code,
      payment_options: cfg.paymentOptions,
      meta: { product: 'robot-training-class', currency: cfg.code },
      customer: {
        email: `class-${Date.now()}@empirebot.space`,
        name: 'Robot Training Class Student',
        phone_number: '',
      },
      customizations: {
        title: 'Robot Training Class',
        description: 'Start creating your own robots by yourself — 2 weeks',
        logo: 'https://i.ibb.co/8LMKhwqt/download.jpg',
      },
      callback: (response: { status?: string; transaction_id?: string | number }) => {
        if (response?.status === 'successful' || response?.status === 'completed') {
          const serial = generateSerial()
          setSuccessSerial(serial)
          setModal('success')
          setShowConfetti(true)
        } else {
          setModal('invite')
          setErrorMsg('Payment was not completed. You can try again.')
        }
      },
      onclose: () => {
        setModal((m) => (m === 'paying' ? 'invite' : m))
      },
    })
  }, [currency, scriptReady])

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full bg-[#9fff00]/[0.07] blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-[#00A884]/[0.06] blur-[100px] pointer-events-none" />

      <Confetti active={showConfetti} />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5 max-w-5xl mx-auto">
        <Link to="/" className="font-display font-bold text-lg tracking-tight text-white/90 hover:text-[#9fff00] transition">
          Empire MD
        </Link>
        <span className="text-xs uppercase tracking-widest text-white/40">Official Class</span>
      </header>

      <main className="relative z-10 max-w-3xl mx-auto px-6 pb-20 pt-6">
        {/* Title */}
        <div className="text-center mb-10">
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#9fff00]/15 text-[#9fff00] text-[11px] font-bold uppercase tracking-widest mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#9fff00] animate-pulse" />
            Limited Seats
          </span>
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold leading-[1.08] tracking-tight mb-4">
            Robot Training{' '}
            <span className="bg-gradient-to-r from-[#9fff00] to-[#00A884] bg-clip-text text-transparent">
              Class
            </span>
          </h1>
          <p className="text-white/60 text-base sm:text-lg max-w-lg mx-auto leading-relaxed">
            Start creating your own robots by yourself.
            <br />
            <span className="text-[#9fff00]/90 font-medium">We promise you can — in just 2 weeks.</span>
          </p>
        </div>

        {/* Venue + Date card */}
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-6 sm:p-8 mb-10 text-center">
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8 mb-8">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-[#25D366]/15 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#25D366">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-[11px] uppercase tracking-wider text-white/40">Venue</p>
                <p className="font-semibold text-white">WhatsApp</p>
              </div>
            </div>
            <div className="w-px h-10 bg-white/10 hidden sm:block" />
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-[#9fff00]/15 flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9fff00" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-[11px] uppercase tracking-wider text-white/40">Date & Time</p>
                <p className="font-semibold text-white">20 Aug 2026 · 8:00 PM</p>
              </div>
            </div>
          </div>

          <p className="text-xs uppercase tracking-widest text-white/40 mb-4">Class starts in</p>
          <Countdown />
        </div>

        {/* Animated Poll */}
        <div className="mb-12">
          <AnimatedPoll />
        </div>

        {/* Thumbprint CTA */}
        <div className="flex flex-col items-center gap-6">
          <ThumbprintButton onClick={() => setModal('invite')} />
          <p className="text-xs text-white/30 max-w-xs text-center">
            Tap the fingerprint to unlock your seat. Over 130 people already voted for WhatsApp.
          </p>
        </div>
      </main>

      {/* ========== MODALS ========== */}
      {modal !== 'closed' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && modal === 'invite') setModal('closed')
          }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md animate-[fadeIn_0.25s_ease-out]" />

          {/* Glass card */}
          <div
            className={`relative w-full max-w-md rounded-3xl border border-white/15 bg-white/[0.08] backdrop-blur-2xl shadow-2xl overflow-hidden animate-[slideUp_0.35s_ease-out]
              ${modal === 'success' || modal === 'miss-final' ? 'border-[#9fff00]/40' : ''}`}
          >
            {/* Glow top */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#9fff00]/60 to-transparent" />

            <div className="p-7 sm:p-8">
              {/* INVITE */}
              {modal === 'invite' && (
                <>
                  <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#9fff00]/15 mb-4">
                      <span className="text-3xl">🤖</span>
                    </div>
                    <h2 className="font-display text-2xl font-bold mb-2">
                      Start creating your own robots
                    </h2>
                    <p className="text-white/60 text-sm leading-relaxed">
                      by yourself. We promise you can — in just{' '}
                      <span className="text-[#9fff00] font-semibold">2 weeks</span>.
                    </p>
                  </div>

                  {/* Currency selector */}
                  <div className="flex justify-center gap-2 mb-6">
                    {(Object.keys(CLASS_PRICES) as CurrencyCode[]).map((code) => (
                      <button
                        key={code}
                        onClick={() => setCurrency(code)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
                          currency === code
                            ? 'border-[#9fff00] bg-[#9fff00]/15 text-[#9fff00]'
                            : 'border-white/15 text-white/50 hover:border-white/30'
                        }`}
                      >
                        {CLASS_PRICES[code].country}
                      </button>
                    ))}
                  </div>

                  <div className="text-center mb-6">
                    <p className="text-3xl font-display font-bold text-[#9fff00]">
                      {CLASS_PRICES[currency].symbol}
                      {CLASS_PRICES[currency].amount.toLocaleString()}
                    </p>
                    <p className="text-xs text-white/40 mt-1">One-time · Full access</p>
                  </div>

                  {errorMsg && (
                    <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 mb-4 text-center">
                      {errorMsg}
                    </p>
                  )}

                  <div className="space-y-3">
                    <button
                      onClick={startPayment}
                      className="w-full py-3.5 rounded-2xl bg-[#9fff00] text-black font-bold text-sm hover:bg-[#b3ff33] transition-all active:scale-[0.98]"
                    >
                      Pay now & access class
                    </button>
                    <button
                      onClick={() => setModal('no-money')}
                      className="w-full py-3.5 rounded-2xl border border-white/15 text-white/70 font-medium text-sm hover:bg-white/5 transition-all"
                    >
                      I don’t have money now
                    </button>
                  </div>

                  <p className="text-[11px] text-white/30 text-center mt-5 leading-relaxed">
                    Bank transfer & mobile money available.  
                    After selecting “Pay now”, choose <strong className="text-white/50">Bank Transfer</strong> or Mobile Money inside Flutterwave.
                  </p>
                </>
              )}

              {/* NO MONEY */}
              {modal === 'no-money' && (
                <div className="text-center">
                  <div className="text-6xl mb-4 animate-bounce">🥺</div>
                  <h2 className="font-display text-xl font-bold mb-3">
                    Don’t undermine yourself
                  </h2>
                  <p className="text-white/70 text-sm leading-relaxed mb-6">
                    You’re more capable than you know.
                    <br />
                    Are you sure you’re giving up this opportunity?
                  </p>
                  <div className="space-y-3">
                    <button
                      onClick={() => {
                        setModal('invite')
                        startPayment()
                      }}
                      className="w-full py-3.5 rounded-2xl bg-[#9fff00] text-black font-bold text-sm hover:bg-[#b3ff33] transition"
                    >
                      I’ll pay the {CLASS_PRICES[currency].symbol}
                      {CLASS_PRICES[currency].amount.toLocaleString()}
                    </button>
                    <button
                      onClick={() => setModal('miss-countdown')}
                      className="w-full py-3.5 rounded-2xl border border-white/15 text-white/50 font-medium text-sm hover:bg-white/5 transition"
                    >
                      I will miss this chance
                    </button>
                  </div>
                </div>
              )}

              {/* MISS COUNTDOWN */}
              {modal === 'miss-countdown' && (
                <div className="text-center py-6">
                  <p className="text-white/50 text-sm mb-4">Closing in…</p>
                  <div className="font-display text-7xl font-bold text-[#9fff00] tabular-nums">
                    {missSeconds}
                  </div>
                </div>
              )}

              {/* MISS FINAL */}
              {modal === 'miss-final' && (
                <div className="text-center py-4">
                  <div className="text-5xl mb-4">✨</div>
                  <h2 className="font-display text-2xl font-bold mb-2">
                    You have potential
                  </h2>
                  <p className="text-white/60 text-sm mb-6">
                    Be ready next time.
                    <br />
                    Goodbye for now.
                  </p>
                  <button
                    onClick={() => {
                      setModal('closed')
                      setShowConfetti(false)
                    }}
                    className="px-6 py-2.5 rounded-full border border-white/20 text-sm text-white/70 hover:bg-white/5 transition"
                  >
                    Close
                  </button>
                </div>
              )}

              {/* PAYING */}
              {modal === 'paying' && (
                <div className="text-center py-8">
                  <div className="w-12 h-12 border-2 border-[#9fff00]/30 border-t-[#9fff00] rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-white/70 text-sm">Opening secure payment…</p>
                  <p className="text-xs text-white/40 mt-2">
                    Prefer bank transfer? Select it inside the Flutterwave window.
                  </p>
                </div>
              )}

              {/* SUCCESS */}
              {modal === 'success' && (
                <div className="text-center">
                  <div className="text-5xl mb-3">🎉</div>
                  <h2 className="font-display text-2xl font-bold text-[#9fff00] mb-2">
                    Congratulations!
                  </h2>
                  <p className="text-white/70 text-sm mb-5">
                    You’re in. Your seat is reserved.
                  </p>
                  <div className="rounded-2xl bg-black/40 border border-[#9fff00]/30 px-4 py-3 mb-5">
                    <p className="text-[11px] uppercase tracking-wider text-white/40 mb-1">
                      Your Serial Number
                    </p>
                    <p className="font-mono text-lg font-bold text-[#9fff00] tracking-wider">
                      {successSerial}
                    </p>
                  </div>
                  <p className="text-sm text-white/60 mb-1">
                    Redirecting to WhatsApp in{' '}
                    <span className="text-[#9fff00] font-bold tabular-nums">{redirectSeconds}s</span>
                  </p>
                  <p className="text-xs text-white/40">
                    Please send the serial so we can add you to the class group.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer note */}
      <footer className="relative z-10 text-center pb-8 text-[11px] text-white/25">
        Empire Digitals · Robot Training Class · WhatsApp only
      </footer>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}
