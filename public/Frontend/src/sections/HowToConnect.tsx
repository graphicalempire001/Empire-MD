import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'

// Updated to your new Shorts ID
const VIDEO_ID = 'h3RqbsJbOR8'

export default function HowToConnect() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const post = (func: string) => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args: [] }),
      '*'
    )
  }

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        // Auto-play when visible, pause when scrolled away
        if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
          post('playVideo')
        } else {
          post('pauseVideo')
        }
      },
      { threshold: [0, 0.6, 1] }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <section className="section-padding py-20" style={{ backgroundColor: '#EDEEF5' }}>
      <div className="max-w-3xl mx-auto text-center">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#00A884] uppercase tracking-wider mb-2">
          Watch &amp; Learn
        </span>
        <h2 className="heading-lg text-[#1a1a1a] mb-3">
          How to <span className="text-gradient-green">Connect &amp; Pair</span>
        </h2>
        <p className="body-text max-w-lg mx-auto mb-10">
          A 60-second walkthrough on linking your WhatsApp and getting your bot live.
        </p>

        <motion.div
          ref={wrapRef}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative mx-auto w-full max-w-[340px] aspect-[9/16] rounded-3xl overflow-hidden shadow-2xl glass-card bg-black"
        >
          <iframe
            ref={iframeRef}
            className="absolute inset-0 w-full h-full"
            /* 
               CHANGES: 
               1. Updated VIDEO_ID
               2. mute=0 to enable sound (Note: browsers may require user interaction first)
               3. controls=1 so users can adjust volume/scrub
            */
            src={`https://www.youtube.com/embed/${VIDEO_ID}?enablejsapi=1&autoplay=1&mute=0&loop=1&playlist=${VIDEO_ID}&controls=1&modestbranding=1&playsinline=1&rel=0`}
            title="How to connect and pair Empire MD"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            frameBorder="0"
            allowFullScreen
          />
          
          {/* Edge-blend masks for aesthetic integration */}
          <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-black/[0.06]"></div>
          <div className="pointer-events-none absolute top-0 left-0 w-full h-10 bg-gradient-to-b from-[#EDEEF5] to-transparent opacity-50"></div>
          <div className="pointer-events-none absolute bottom-0 left-0 w-full h-10 bg-gradient-to-t from-[#EDEEF5] to-transparent opacity-50"></div>
        </motion.div>
      </div>
    </section>
  )
}
