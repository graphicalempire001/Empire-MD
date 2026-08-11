import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const testimonials = [
  {
    name: 'Tunde A.',
    location: 'Lagos',
    lang: 'pidgin',
    text: 'Honestly I almost give up on WhatsApp bots. Then I pair Empire MD. Status view still dey work even when my phone sleep. Sticker quality clean. Mishael people no dey play.',
    feature: 'Auto Status View',
    rating: 5,
  },
  {
    name: 'Chioma O.',
    location: 'Abuja',
    lang: 'en',
    text: 'I run a small boutique. .play for music in the group, .antilink so nobody dumps nonsense links, and the invoice/receipt commands? Customers respect us more. Setup was literally two minutes.',
    feature: 'Business + Moderation',
    rating: 5,
  },
  {
    name: 'Emeka N.',
    location: 'Port Harcourt',
    lang: 'en',
    text: 'Premium anti-delete saved me twice already. Someone deleted a message with an important number — bot brought it back. Ghost mode too; nobody even knows when the bot replies. Worth the ₦1,500.',
    feature: 'Anti-Delete & Ghost',
    rating: 5,
  },
  {
    name: 'Aisha M.',
    location: 'Kano',
    lang: 'pidgin',
    text: 'Customer care used to stress me. Auto-reply + AI mode make my number look like real company. Welcome messages for new group members too. Empire Digitals know wetin dem dey do.',
    feature: 'AI Customer Care',
    rating: 5,
  },
  {
    name: 'David I.',
    location: 'Ibadan',
    lang: 'en',
    text: 'I use broadcast with channel cards for church announcements. One command reaches all groups. Clean UI on the website, pairing code no stress. Best multi-device bot I have tried.',
    feature: 'Broadcast & Growth',
    rating: 5,
  },
  {
    name: 'Blessing K.',
    location: 'Enugu',
    lang: 'pidgin',
    text: 'My old bot keep disconnect. Empire MD stable. .vv for view-once pictures people send, .send to save status. Premium features no dey joke. Support on WhatsApp also sharp.',
    feature: 'Stability & .vv',
    rating: 5,
  },
  {
    name: 'Kunle B.',
    location: 'Ikeja',
    lang: 'en',
    text: 'I manage three business groups. Tagall, promote, kick, antilink — everything smooth. Free plan already strong; Premium just unlocks the serious security tools. No regret.',
    feature: 'Group Management',
    rating: 5,
  },
  {
    name: 'Fatima S.',
    location: 'Kaduna',
    lang: 'en',
    text: 'Bible and Quran commands for our fellowship group. Plus sticker maker the kids love. Pairing from the site took less time than I used to wait for my previous bot to load.',
    feature: 'Faith + Stickers',
    rating: 5,
  },
  {
    name: 'Chidi O.',
    location: 'Owerri',
    lang: 'en',
    text: 'OCR from handwritten note to Word doc? I use it for meeting minutes. PDF and receipt for clients. This is not an ordinary bot — it is a real business tool. Respect to Mishael Yakubu.',
    feature: 'OCR & Documents',
    rating: 5,
  },
  {
    name: 'Grace E.',
    location: 'Benin',
    lang: 'en',
    text: 'Private mode so only I can use commands in my personal chat. Public when I want members to use .play. Mode switch is easy. Documentation on the site is clear. Highly recommend.',
    feature: 'Public / Private Mode',
    rating: 5,
  },
]

export default function Testimonials() {
  const sectionRef = useRef<HTMLElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    const section = sectionRef.current
    const grid = gridRef.current
    if (!section || !grid) return

    const ctx = gsap.context(() => {
      gsap.fromTo(
        grid.children,
        { opacity: 0, y: 36 },
        {
          opacity: 1,
          y: 0,
          duration: 0.65,
          stagger: 0.1,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 72%',
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
      id="testimonials"
      className="relative py-20 md:py-28"
      style={{ backgroundColor: '#F7F8FC' }}
    >
      {/* SEO / entity text for creator */}
      <div className="sr-only">
        Empire MD WhatsApp bot reviews. Built by Empire Digitals, headed by Mishael Yakubu.
        Official CEO site: https://ceo.empiredigitals.space
      </div>

      <div className="max-w-7xl mx-auto section-padding">
        <div className="text-center mb-12 md:mb-16">
          <p className="text-[#00A884] font-semibold text-xs tracking-widest uppercase mb-3">
            Social proof
          </p>
          <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl text-[#0d1117] mb-4">
            Users call it the best
          </h2>
          <p className="text-[#5c6370] text-sm md:text-base max-w-xl mx-auto leading-relaxed">
            Real feedback from people running Empire MD every day — status automation, groups,
            music, AI care, and more. Built professionally by{' '}
            <a
              href="https://ceo.empiredigitals.space"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#00A884] font-medium hover:underline"
            >
              Empire Digitals
            </a>{' '}
            under{' '}
            <strong className="text-[#0d1117]">Mishael Yakubu</strong>.
          </p>
        </div>

        <div ref={gridRef} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
          {testimonials.map((t) => (
            <article
              key={t.name}
              className="rounded-2xl bg-white border border-black/[0.05] p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col"
            >
              <div className="flex items-center gap-1 mb-3 text-[#00A884]" aria-label={`${t.rating} stars`}>
                {Array.from({ length: t.rating }).map((_, i) => (
                  <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                ))}
              </div>

              <p className="text-[#2a2f38] text-sm leading-relaxed flex-1 mb-5">
                “{t.text}”
              </p>

              <div className="flex items-center justify-between gap-3 pt-4 border-t border-black/[0.05]">
                <div>
                  <p className="font-semibold text-sm text-[#0d1117]">{t.name}</p>
                  <p className="text-[11px] text-[#8e8e8e]">{t.location}</p>
                </div>
                <span className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-[#00A884]/10 text-[#008f72]">
                  {t.feature}
                </span>
              </div>
            </article>
          ))}
        </div>

        <p className="text-center text-[11px] text-[#8e8e8e] mt-10">
          Empire MD · Product of{' '}
          <a href="https://ceo.empiredigitals.space" className="text-[#00A884] hover:underline" target="_blank" rel="noopener noreferrer">
            Empire Digitals
          </a>{' '}
          · CEO{' '}
          <span className="font-medium text-[#5c6370]">Mishael Yakubu</span>
        </p>
      </div>
    </section>
  )
}
