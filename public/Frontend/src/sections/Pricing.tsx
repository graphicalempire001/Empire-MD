import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const plans = [
  {
    name: 'Free Bot',
    price: 'Free',
    priceNote: 'forever',
    description: 'Get started with essential WhatsApp automation at no cost.',
    features: [
      'Basic auto-reply',
      'Status viewer (.asv)',
      'Status reactions (.asr)',
      'Music search (.play)',
      'Sticker maker (.s)',
      'Group open/close',
      'Anti-link protection (.antilink)',
      'Community support',
    ],
    cta: 'Get Free Bot',
    ctaStyle: 'outline' as const,
    highlight: false,
    badge: null,
  },
  {
    name: 'BORGEEYES Robot',
    price: '₦5,000',
    priceNote: '/month',
    description: 'Advanced automation for power users who need more control anf functions.',
    features: [
      'Everything in Free',
      'Plugin system for sports, Office, PDF, MS Word, Customer care service(.plugin)',
      'Auto typing & recording (.auto)',
      'AI customer replies (.cs)',
      'Auto-save contacts (.contacts)',
      'Broadcast messaging with custom channel link(.bc)',
      'Priority support',
    ],
    cta: 'Get Borgeyes',
    ctaStyle: 'solid' as const,
    highlight: true,
    badge: 'Most Popular',
  },
  {
    name: 'MVP Bot',
    price: '₦12,000',
    priceNote: '/month',
    description: 'The ultimate package with unlimited power and all features.',
    features: [
      'Everything in Borgeyes',
      'AI video generation (.grok)',
      'Leads Generator (.lg)',
      'Advanced AI learning',
      'Unlimited broadcasts',
      'Custom plugin development',
      'White-label option',
      '24/7 dedicated support',
      'Early access to new features',
    ],
    cta: 'Get MVP',
    ctaStyle: 'solid' as const,
    highlight: false,
    badge: 'Best Value',
  },
]

export default function Pricing() {
  const sectionRef = useRef<HTMLElement>(null)
  const cardsRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    const section = sectionRef.current
    const cards = cardsRef.current
    if (!section || !cards) return

    const ctx = gsap.context(() => {
      gsap.fromTo(
        cards.children,
        { opacity: 0, y: 60 },
        {
          opacity: 1,
          y: 0,
          duration: 0.7,
          stagger: 0.15,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 65%',
            toggleActions: 'play none none none',
          },
        }
      )
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
      {/* Subtle gradient blob */}
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

        {/* Pricing Cards */}
        <div ref={cardsRef} className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((plan, i) => (
            <div
              key={i}
              className={`relative rounded-3xl p-6 md:p-8 transition-all duration-300 hover:-translate-y-2 ${
                plan.highlight
                  ? 'bg-[#1a1a1a] text-white shadow-2xl shadow-[#1a1a1a]/20 scale-[1.02] md:scale-[1.05]'
                  : 'bg-white/80 backdrop-blur-sm border border-black/[0.06] hover:shadow-xl'
              }`}
            >
              {/* Badge */}
              {plan.badge && (
                <div className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  plan.highlight
                    ? 'bg-[#9fff00] text-[#1a1a1a]'
                    : 'bg-[#00A884] text-white'
                }`}>
                  {plan.badge}
                </div>
              )}

              {/* Plan Header */}
              <div className="mb-6">
                <h3 className={`font-display font-bold text-lg mb-2 ${plan.highlight ? 'text-white' : 'text-[#1a1a1a]'}`}>
                  {plan.name}
                </h3>
                <div className="flex items-baseline gap-1">
                  <span className={`font-display font-bold text-3xl md:text-4xl ${plan.highlight ? 'text-white' : 'text-[#1a1a1a]'}`}>
                    {plan.price}
                  </span>
                  <span className={`text-xs ${plan.highlight ? 'text-white/60' : 'text-[#8e8e8e]'}`}>
                    {plan.priceNote}
                  </span>
                </div>
                <p className={`text-xs mt-2 leading-relaxed ${plan.highlight ? 'text-white/70' : 'text-[#8e8e8e]'}`}>
                  {plan.description}
                </p>
              </div>

              {/* Features List */}
              <ul className="space-y-3 mb-8">
                {plan.features.map((feature, fi) => (
                  <li key={fi} className="flex items-start gap-2.5">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 mt-0.5">
                      <path d="M3 8.5L6.5 12L13 5" stroke={plan.highlight ? '#9fff00' : '#00A884'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span className={`text-xs leading-relaxed ${plan.highlight ? 'text-white/80' : 'text-[#8e8e8e]'}`}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              {/* CTA Button */}
              <a
                href={`https://wa.me/2347086757575?text=${encodeURIComponent(`Hi! I want to subscribe to the ${plan.name} plan.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`block w-full text-center py-3.5 rounded-2xl text-sm font-semibold transition-all duration-300 ${
                  plan.ctaStyle === 'solid'
                    ? plan.highlight
                      ? 'bg-[#9fff00] text-[#1a1a1a] hover:bg-[#b3ff33]'
                      : 'bg-[#1a1a1a] text-white hover:bg-[#333]'
                    : plan.highlight
                    ? 'bg-white/10 text-white border border-white/20 hover:bg-white/20'
                    : 'bg-transparent text-[#1a1a1a] border border-black/[0.1] hover:bg-black/[0.03]'
                }`}
              >
                {plan.cta}
              </a>
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
