import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { PLAN_TIERS, formatNaira, type PlanTier } from '../lib/pricing'

declare global {
  interface Window {
    FlutterwaveCheckout?: (opts: Record<string, unknown>) => void
  }
}

const FLW_SCRIPT_SRC = 'https://checkout.flutterwave.com/v3.js'
const FLW_PUBLIC_KEY = import.meta.env.VITE_FLW_PUBLIC_KEY as string | undefined

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

type Status =
  | { kind: 'idle' }
  | { kind: 'paying' }
  | { kind: 'verifying' }
  | { kind: 'success'; expiresAt: string; botName?: string; months: number }
  | { kind: 'error'; message: string }

export default function Upgrade() {
  const [selected, setSelected] = useState<PlanTier>(PLAN_TIERS[0])
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [scriptReady, setScriptReady] = useState(false)

  useEffect(() => {
    loadFlutterwaveScript()
      .then(() => setScriptReady(true))
      .catch(() => setStatus({ kind: 'error', message: 'Could not load the payment page. Check your connection and reload.' }))
  }, [])

  const cleanPhone = phone.replace(/[^0-9]/g, '')
  const phoneValid = cleanPhone.length >= 10 && cleanPhone.length <= 14
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  // Flutterwave's checkout requires customer.email — this is a real, required
  // field on their side, not something we can omit. Since this product is
  // deliberately phone-first, the input is optional: if the user skips it we
  // fall back to a syntactically valid placeholder so checkout never breaks,
  // but a real email means they'll actually get Flutterwave's own receipt.
  const effectiveEmail = emailValid ? email.trim() : `${cleanPhone || 'customer'}@empirebot.space`

  async function verifyPayment(transactionId: string | number) {
    setStatus({ kind: 'verifying' })
    try {
      const res = await fetch('/api/payment/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone, months: selected.months, transaction_id: transactionId }),
      })
      const data = await res.json()
      if (data?.success) {
        setStatus({ kind: 'success', expiresAt: data.expires_at, botName: data.bot_name, months: data.months })
      } else {
        setStatus({ kind: 'error', message: data?.error || 'Verification failed. Contact support with your payment reference.' })
      }
    } catch {
      setStatus({
        kind: 'error',
        message: 'Payment may have gone through, but we could not confirm it automatically. Contact support with your payment reference — nothing is lost.',
      })
    }
  }

  function startPayment() {
    if (!FLW_PUBLIC_KEY) {
      setStatus({ kind: 'error', message: 'Payments are not configured yet. Contact support.' })
      return
    }
    if (!phoneValid) {
      setStatus({ kind: 'error', message: 'Enter the WhatsApp number your bot is paired with.' })
      return
    }
    if (!scriptReady || !window.FlutterwaveCheckout) {
      setStatus({ kind: 'error', message: 'Payment page still loading — try again in a moment.' })
      return
    }

    const tx_ref = `EMD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setStatus({ kind: 'paying' })

    window.FlutterwaveCheckout({
      public_key: FLW_PUBLIC_KEY,
      tx_ref,
      amount: selected.price,
      currency: 'NGN',
      payment_options: 'card,banktransfer,ussd,mobilemoney',
      meta: { months: selected.months, phone: cleanPhone },
      customer: { phone_number: cleanPhone, email: effectiveEmail, name: 'Empire MD Customer' },
      customizations: {
        title: 'Empire MD Premium',
        description: `${selected.months} month${selected.months > 1 ? 's' : ''} of Premium`,
        logo: 'https://i.ibb.co/8LMKhwqt/download.jpg',
      },
      callback: (response: { transaction_id?: string | number; status?: string }) => {
        if (response?.status === 'successful' || response?.status === 'completed') {
          verifyPayment(response.transaction_id as string | number)
        } else {
          setStatus({ kind: 'error', message: 'Payment was not completed.' })
        }
      },
      onclose: () => {
        setStatus((s) => (s.kind === 'paying' ? { kind: 'idle' } : s))
      },
    })
  }

  return (
    <div className="min-h-screen bg-black text-white px-4 py-16">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-bold text-center mb-2">
          Upgrade to <span className="text-[#C6FF3D]">Premium</span>
        </h1>
        <p className="text-center text-white/60 mb-10">
          Longer plans cost less per month — the discount compounds the more you commit.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {PLAN_TIERS.map((tier) => (
            <button
              key={tier.months}
              onClick={() => setSelected(tier)}
              className={`rounded-2xl border p-4 text-left transition ${
                selected.months === tier.months
                  ? 'border-[#C6FF3D] bg-[#C6FF3D]/10'
                  : 'border-white/15 bg-white/5 hover:border-white/30'
              }`}
            >
              <div className="text-sm text-white/60">
                {tier.months === 1 ? '1 month' : `${tier.months} months`}
              </div>
              <div className="text-xl font-bold mt-1">{formatNaira(tier.price)}</div>
              {tier.savingsPct > 0 && (
                <div className="text-xs text-[#FFD23F] mt-1">Save {tier.savingsPct}%</div>
              )}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-white/15 bg-white/5 p-6 max-w-md mx-auto">
          <label className="block text-sm text-white/70 mb-2">
            WhatsApp number your bot is paired with
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="2348012345678"
            className="w-full rounded-lg bg-black border border-white/20 px-3 py-2 mb-4 outline-none focus:border-[#C6FF3D]"
          />

          <label className="block text-sm text-white/70 mb-2">
            Email <span className="text-white/40">(optional — for your payment receipt)</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg bg-black border border-white/20 px-3 py-2 mb-4 outline-none focus:border-[#C6FF3D]"
          />

          <button
            onClick={startPayment}
            disabled={status.kind === 'paying' || status.kind === 'verifying'}
            className="w-full rounded-lg bg-[#C6FF3D] text-black font-semibold py-3 disabled:opacity-50"
          >
            {status.kind === 'verifying'
              ? 'Confirming payment…'
              : status.kind === 'paying'
                ? 'Opening payment page…'
                : `Pay ${formatNaira(selected.price)}`}
          </button>

          {status.kind === 'success' && (
            <div className="mt-4 rounded-lg bg-[#C6FF3D]/10 border border-[#C6FF3D]/40 p-3 text-sm space-y-2">
              <p>
                ✅ Premium activated{status.botName ? <> for <strong>{status.botName}</strong></> : ''} — {status.months} month
                {status.months > 1 ? 's' : ''}, valid until{' '}
                {new Date(status.expiresAt).toLocaleDateString()}.
              </p>
              <p className="text-white/70">
                Check your WhatsApp — we've sent your dashboard login (bot name + password) to your own chat.
              </p>
              <Link
                to="/dashboard"
                className="inline-block mt-1 rounded-lg bg-[#C6FF3D] text-black text-xs font-semibold px-4 py-2 hover:bg-[#d9ff70] transition-colors"
              >
                Open Dashboard →
              </Link>
            </div>
          )}
          {status.kind === 'error' && (
            <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/40 p-3 text-sm text-red-200">
              {status.message}
            </div>
          )}

          <p className="text-xs text-white/40 mt-4">
            Already paired? Premium activates within seconds of payment. Not paired yet? Premium is
            saved to your number and applies automatically the moment you pair.
          </p>
        </div>
      </div>
    </div>
  )
}
