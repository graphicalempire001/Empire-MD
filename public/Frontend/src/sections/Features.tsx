import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const commands = [
  { icon: '👁️', cmd: '.asv', desc: 'Auto status View — views all saved contacts status automatically, even when your phone is off', color: '#00A884' },
  { icon: '❤️', cmd: '.asr', desc: 'Automatically react to your saved contacts status', color: '#25D366' },
  { icon: '🎵', cmd: '.play', desc: 'Gives you any audio music from anywhere', color: '#128C7E' },
  { icon: '🎨', cmd: '.s', desc: 'Create stickers from replied images', color: '#00A884' },
  { icon: '🔒', cmd: '.open/.close', desc: 'Closes and opens group as admin', color: '#25D366' },
  { icon: '🛡️', cmd: '.antilink', desc: 'Stops spammers from spamming group with links', color: '#128C7E' },
  { icon: '🧩', cmd: '.plugin', desc: 'Adds services like PDF, doc, OCR, sports and other powerful tools', color: '#00A884' },
  { icon: '✨', cmd: '.grok', desc: 'AI video generation (coming soon)', color: '#25D366', badge: 'Soon' },
  { icon: '⌨️', cmd: '.auto', desc: 'Auto typing, recording and auto online', color: '#128C7E' },
  { icon: '🧠', cmd: '.ai', desc: 'Learns how to treat customers and reply your chats even if you are offline', color: '#00A884' },
  { icon: '👥', cmd: '.contacts', desc: 'Automatically save contacts in a group and from new chats', color: '#25D366' },
  { icon: '📢', cmd: '.bc', desc: 'Broadcast the same message to every group safely', color: '#128C7E' },
]

export default function Features() {
  const sectionRef = useRef<HTMLElement>(null)
  const cardsRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    const section = sectionRef.current
    const cards = cardsRef.current
    if (!section || !cards) return

    const ctx = gsap.context(() => {
      gsap.fromTo(
        cards.children,
        { opacity: 0, y: 50, scale: 0.95 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.6,
          stagger: 0.08,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 70%',
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
      id="features"
      className="relative py-24 md:py-32 overflow-hidden"
      style={{ backgroundColor: '#EDEEF5' }}
    >
      <div className="max-w-7xl mx-auto section-padding">
        {/* Section Header */}
        <div className="text-center mb-16">
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#00A884]/10 text-[#00A884] text-[11px] font-bold uppercase tracking-widest mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00A884] animate-pulse"></span>
            Powerful Commands
          </span>
          <h2 className="heading-lg text-[#1a1a1a] mb-4">
            Smart Automation.<br />
            <span className="text-gradient-green">Total Control.</span>
          </h2>
          <p className="body-text max-w-lg mx-auto">
            Empire MD comes packed with powerful commands to automate your WhatsApp experience. From media downloads to AI replies, we have got you covered.
          </p>
        </div>

        {/* Commands Grid */}
        <div ref={cardsRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {commands.map((item, i) => (
            <div
              key={i}
              className="group glass-card rounded-2xl p-5 hover:bg-white/90 transition-all duration-300 hover:shadow-lg hover:shadow-[#00A884]/5 hover:-translate-y-1 cursor-default"
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-lg shrink-0"
                  style={{ backgroundColor: `${item.color}15` }}
                >
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm font-bold text-[#1a1a1a]">{item.cmd}</span>
                    {item.badge && (
                      <span className="px-2 py-0.5 rounded-full bg-[#9fff00]/20 text-[#5a9900] text-[10px] font-bold uppercase">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#8e8e8e] leading-relaxed">{item.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom tagline */}
        <div className="mt-12 text-center">
          <p className="text-xs font-semibold text-[#8e8e8e] uppercase tracking-widest">
            Smarter Bots. Stronger Groups. Safer Automation.
          </p>
        </div>
      </div>
    </section>
  )
}
