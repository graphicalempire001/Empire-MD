import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Link } from 'react-router'

gsap.registerPlugin(ScrollTrigger)

const plans = [
  {
    name: 'Free Bot',
    price: 'Free',
    priceNote: 'forever',
    cta: 'Get Free Bot',
    highlight: false,
    isFree: true,
  },
  {
    name: 'Premium',
    price: '₦1,500',
    priceNote: '/month',
    cta: 'Get Premium',
    highlight: true,
    badge: 'Most Popular',
    isFree: false,
  },
]

// Each row: [label, freeValue, premiumValue]
// freeValue/premiumValue: true = check, false = locked, or a string for custom text
const comparisonRows: { label: string; free: boolean | string; premium: boolean | string }[] = [
  { label: 'Daily command limit', free: '20 / day', premium: 'Unlimited' },
  { label: 'Message delivery', free: 'Standard queue', premium: 'Priority (skip queue)' },
  { label: 'Auto status view & react', free: true, premium: true },
  { label: 'Sticker maker (.s)', free: true, premium: true },
  { label: 'Group tools & anti-link protection', free: true, premium: true },
  { label: 'Ghost Mode (.vv / .pp / .send, zero trace)', free: false, premium: true },
  { label: 'Heavy commands (PDF, Receipt, Invoice, Word, Excel, OCR)', free: false, premium: true },
  { label: 'AI chat & AI customer replies', free: false, premium: true },
  { label: 'Web dashboard (manage & read chats)', free: false, premium: true },
  { label: 'Support', free: 'Community', premium: 'Priority' },
]

function Cell({ value, isPremiumCol }: { value: boolean | string; isPremiumCol: boolean }) {
  if (typeof value === 'string') {
    return (
      <span className={`text-xs font-semibold ${isPremiumCol ? 'text-[#1a1a1a]' : 'text-[#5a5a5a]'}`}>
        {value}
      </span>
    )
  }
  if (value) {
    return (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" className="mx-auto">
        <path
          d="M3 8.5L6.5 12L13 5"
          stroke={isPremiumCol ? '#00A884' : '#00A884'}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mx-auto opacity-40">
      <path d="M4 4L12 12M12 4L4 12" stroke="#b5b5b5" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export default function Pricing({ onGetBot }: { onGetBot: () => void }) {
  const sectionRef = useRef<HTMLElement>(null)
  const cardsRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    const section = sectionRef.current
    const cards = cardsRef.current
    const table = tableRef.current
    if (!section) return

    const ctx = gsap.context(() => {
      if (cards) {
        gsap.fromTo(
          cards.children,
          { opacity: 0, y: 60 },
          {
            opacity: 1,
            y: 0,
            duration: 0.7,
            stagger: 0.15,
            ease: 'power2.out',
            scrollTrigger: { trigger: section, start: 'top 65%', toggleActions: 'play none none none' },
          }
        )
      }
      if (table) {
        gsap.fromTo(
          table,
          { opacity: 0, y: 40 },
          {
            opacity: 1,
            y: 0,
            duration: 0.7,
            ease: 'power2.out',
            scrollTrigger: { trigger: table, start: 'top 80%', toggleActions: 'play none none none' },
          }
        )
      }
    }, section)

    return () => ctx.revert()
  }, { scope: sectionRef })

  return (
    <section
      ref={sectionRef}
      id="pricing"
      className="relative py-24 md:py-32 overflow-hidden"
      style={{ backgroundColor: '#EDEEF5' }}
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[#00A884]/[0.03] blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto section-padding relative z-10">
        {/* Section Header */}
        <div className="text-center mb-16">
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#9fff00]/15 text-[#5a9900] text-[11px] font-bold uppercase tracking-widest mb-4">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            Simple Pricing
          </span>
          <h2 className="heading-lg text-[#1a1a1a] mb-4">
            Choose Your <span className="text-gradient-green">Bot Plan</span>
          </h2>
          <p className="body-text max-w-lg mx-auto">
            Start free and upgrade when you need more power. No hidden fees, cancel anytime.
          </p>
        </div>

        {/* Price Cards (CTA only, no feature lists — table below does that job) */}
        <div ref={cardsRef} className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto mb-12">
          {plans.map((plan, i) => (
            <div
              key={i}
              className={`relative rounded-3xl p-6 md:p-8 text-center transition-all duration-300 hover:-translate-y-2 ${
                plan.highlight
                  ? 'bg-[#1a1a1a] text-white shadow-2xl shadow-[#1a1a1a]/20 scale-[1.02] md:scale-[1.05]'
                  : 'bg-white/80 backdrop-blur-sm border border-black/[0.06] hover:shadow-xl'
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#9fff00] text-[#1a1a1a]">
                  {plan.badge}
                </div>
              )}

              <h3 className={`font-display font-bold text-lg mb-2 ${plan.highlight ? 'text-white' : 'text-[#1a1a1a]'}`}>
                {plan.name}
              </h3>
              <div className="flex items-baseline justify-center gap-1 mb-6">
                <span className={`font-display font-bold text-3xl md:text-4xl ${plan.highlight ? 'text-white' : 'text-[#1a1a1a]'}`}>
                  {plan.price}
                </span>
                <span className={`text-xs ${plan.highlight ? 'text-white/60' : 'text-[#8e8e8e]'}`}>
                  {plan.priceNote}
                </span>
              </div>

              {plan.isFree ? (
                <button
                  onClick={onGetBot}
                  className="block w-full text-center py-3.5 rounded-2xl text-sm font-semibold transition-all duration-300 bg-transparent text-[#1a1a1a] border border-black/[0.1] hover:bg-black/[0.03]"
                >
                  {plan.cta}
                </button>
              ) : (
                <Link
                  to="/upgrade"
                  className="block w-full text-center py-3.5 rounded-2xl text-sm font-semibold transition-all duration-300 bg-[#9fff00] text-[#1a1a1a] hover:bg-[#b3ff33]"
                >
                  {plan.cta}
                </Link>
              )}
            </div>
          ))}
        </div>

        {/* Feature Comparison Table — this is what makes the difference obvious */}
        <div
          ref={tableRef}
          className="max-w-3xl mx-auto rounded-3xl overflow-hidden border border-black/[0.06] bg-white/80 backdrop-blur-sm"
        >
          <div className="grid grid-cols-[1fr_auto_auto] items-center px-5 md:px-8 py-4 border-b border-black/[0.06]">
            <span className="text-xs font-bold uppercase tracking-wider text-[#8e8e8e]">Feature</span>
            <span className="text-xs font-bold uppercase tracking-wider text-[#8e8e8e] w-20 text-center">Free</span>
            <span className="text-xs font-bold uppercase tracking-wider text-[#1a1a1a] w-24 text-center">Premium</span>
          </div>
          {comparisonRows.map((row, i) => (
            <div
              key={i}
              className={`grid grid-cols-[1fr_auto_auto] items-center px-5 md:px-8 py-3.5 ${
                i % 2 === 0 ? 'bg-black/[0.015]' : ''
              }`}
            >
              <span className="text-xs md:text-sm text-[#1a1a1a] pr-3">{row.label}</span>
              <span className="w-20 text-center">
                <Cell value={row.free} isPremiumCol={false} />
              </span>
              <span className="w-24 text-center">
                <Cell value={row.premium} isPremiumCol={true} />
              </span>
            </div>
          ))}
        </div>

        {/* Payment note */}
        <p className="text-center text-[11px] text-[#8e8e8e] mt-8">
          All payments are securely processed. Contact us on WhatsApp for payment details.
        </p>
      </div>
    </section>
  )
}
