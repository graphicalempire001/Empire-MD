import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export default function Transformation() {
  const sectionRef = useRef<HTMLElement>(null)
  const rabbitRef = useRef<HTMLImageElement>(null)
  const robotRef = useRef<HTMLImageElement>(null)
  const particlesRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    const section = sectionRef.current
    const rabbit = rabbitRef.current
    const robot = robotRef.current
    const particles = particlesRef.current
    const text = textRef.current
    if (!section || !rabbit || !robot || !particles || !text) return

    const ctx = gsap.context(() => {
      // Pin the section and create scroll-driven animation
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: '+=200%',
          pin: true,
          scrub: 1,
        },
      })

      // Phase 1: Rabbit fades and shrinks
      tl.to(rabbit, {
        scale: 0.3,
        opacity: 0,
        y: -100,
        rotation: -15,
        duration: 0.4,
        ease: 'power2.inOut',
      }, 0)

      // Phase 2: Green particles burst
      tl.fromTo(
        particles.children,
        {
          scale: 0,
          opacity: 0,
          x: 0,
          y: 0,
        },
        {
          scale: 1,
          opacity: 1,
          x: (i: number) => Math.cos((i / 12) * Math.PI * 2) * 150,
          y: (i: number) => Math.sin((i / 12) * Math.PI * 2) * 150,
          duration: 0.3,
          stagger: 0.02,
          ease: 'power2.out',
        },
        0.15
      )

      // Phase 3: Robot appears and grows
      tl.fromTo(
        robot,
        {
          scale: 0.3,
          opacity: 0,
          y: 100,
          rotation: 15,
        },
        {
          scale: 1,
          opacity: 1,
          y: 0,
          rotation: 0,
          duration: 0.5,
          ease: 'elastic.out(1, 0.5)',
        },
        0.3
      )

      // Phase 4: Particles fade
      tl.to(particles.children, {
        opacity: 0,
        scale: 0.5,
        duration: 0.2,
        stagger: 0.01,
      }, 0.5)

      // Phase 5: Text reveals
      tl.fromTo(
        text.children,
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.3, stagger: 0.1 },
        0.6
      )
    }, section)

    return () => ctx.revert()
  }, { scope: sectionRef })

  return (
    <section
      ref={sectionRef}
      className="relative min-h-screen w-full flex items-center justify-center overflow-hidden"
      style={{ backgroundColor: '#EDEEF5' }}
    >
      {/* Subtle grid background */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `linear-gradient(#1a1a1a 1px, transparent 1px), linear-gradient(90deg, #1a1a1a 1px, transparent 1px)`,
        backgroundSize: '60px 60px',
      }} />

      {/* Central transformation area */}
      <div className="relative w-full max-w-2xl mx-auto flex items-center justify-center h-[60vh]">
        {/* Rabbit */}
        <img
          ref={rabbitRef}
          src="/rabbit-mascot.png"
          alt="Cute Rabbit"
          className="absolute w-48 md:w-64 lg:w-80 h-auto object-contain"
          style={{ willChange: 'transform, opacity' }}
        />

        {/* Green particles */}
        <div ref={particlesRef} className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {Array.from({ length: 16 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-3 h-3 md:w-4 md:h-4 rounded-full"
              style={{
                background: i % 2 === 0 ? '#00A884' : '#9fff00',
                willChange: 'transform, opacity',
              }}
            />
          ))}
        </div>

        {/* Robot */}
        <img
          ref={robotRef}
          src="/robot-mascot.png"
          alt="3D Robot"
          className="absolute w-48 md:w-64 lg:w-80 h-auto object-contain opacity-0"
          style={{ willChange: 'transform, opacity' }}
        />
      </div>

      {/* Text content */}
      <div ref={textRef} className="absolute bottom-[15%] left-0 right-0 text-center px-6">
        <h2 className="heading-lg text-[#1a1a1a] mb-3 opacity-0">
          From Simple to{' '}
          <span className="text-gradient-green">Powerful</span>
        </h2>
        <p className="body-text max-w-md mx-auto opacity-0">
          Watch your simple assistant transform into a full-featured WhatsApp automation robot with Empire MD.
        </p>
      </div>

      {/* Scroll indicator */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
        <span className="text-[10px] font-medium text-[#8e8e8e] uppercase tracking-widest">Scroll to transform</span>
        <div className="w-5 h-8 rounded-full border border-[#8e8e8e]/30 flex items-start justify-center p-1">
          <div className="w-1 h-2 bg-[#00A884] rounded-full animate-bounce"></div>
        </div>
      </div>
    </section>
  )
}
