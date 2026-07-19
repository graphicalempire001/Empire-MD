import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'

interface HeroProps {
  onGetBot: () => void
  onOpenChat: () => void
}

export default function Hero({ onGetBot, onOpenChat }: HeroProps) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  return (
    <section
      className="relative min-h-[100vh] sm:min-h-[140vh] w-full flex flex-col items-center justify-start overflow-hidden bg-[#EDEEF5]"
    >
      {/* Background Layer */}
      <div className="absolute top-[10vh] sm:top-[18vh] left-0 w-full h-[85vh] sm:h-[115vh] z-0 pointer-events-none">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-20"
          style={{ backgroundImage: "url('/hero-bg.jpg')" }}
        ></div>
        <div className="absolute inset-0 bg-[#EDEEF5]/60"></div>

        <video
          autoPlay loop muted playsInline preload="metadata"
          className="relative w-full h-full object-cover opacity-80"
          poster="/hero-bg.jpg"
        >
          <source
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260603_132049_036591b8-6e92-4760-b94c-a7ea6eef315c.mp4"
            type="video/mp4"
          />
        </video>
        <div className="absolute bottom-0 left-0 w-full h-48 bg-gradient-to-t from-[#EDEEF5] via-[#EDEEF5]/60 to-transparent"></div>
      </div>

      {/* Hero Content - Lower Z-Index than Mascot */}
      <div className="max-w-7xl w-full mx-auto px-6 md:px-16 lg:px-20 relative z-10 pt-24 sm:pt-36">
        <div className="max-w-4xl">
          <motion.h1
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.6 }}
            className="heading-xl mb-6 text-[#1a1a1a]"
          >
            Empire <span className="text-[#8e8e8e]">MD</span>
            <br />
            <span className="text-[#8e8e8e]">Launch Your Free Whatsapp</span>
            <br />
            <span className="text-[#8e8e8e]">Bot in 30</span>
            <span className="inline-flex items-center justify-center w-[20px] md:w-[42px] lg:w-[62px] h-[20px] md:h-[42px] lg:h-[62px] border-[2px] border-[#1a1a1a] rounded-full mx-2 align-middle">
              <span className="w-2 h-2 bg-[#1a1a1a] rounded-full"></span>
            </span>
            seconds.
          </motion.h1>

          <motion.div
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            transition={{ delay: 0.3 }}
            className="relative mb-10 max-w-xl"
          >
            <div className="absolute -inset-4 bg-white/30 blur-2xl rounded-full z-0 pointer-events-none"></div>
            <p className="relative z-10 body-text font-bold text-[#1a1a1a] leading-relaxed drop-shadow-[0_2px_8px_rgba(255,255,255,1)]">
              No code. No servers. No stress. Just connect your number and Empire MD handles everything — 
              <span className="text-green-600"> media downloads</span>, 
              <span className="text-blue-600"> stickers</span>, 
              <span className="text-purple-600"> group management</span>, 
              <span className="text-orange-600"> AI chat</span>, and more.
            </p>
          </motion.div>

          {/* Search Pill */}
          <motion.div
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: 0.4 }}
            className="mb-8"
          >
            <div className="bg-white/90 backdrop-blur-md rounded-[12px] border border-black/[0.1] p-1.5 pl-5 flex items-center shadow-lg max-w-md">
              <input
                type="text" 
                placeholder="Ask me anything..." 
                readOnly 
                onClick={onOpenChat}
                className="flex-1 bg-transparent text-sm text-[#1a1a1a] outline-none py-3 cursor-pointer"
              />
              <button 
                onClick={onOpenChat} 
                className="bg-[#1a1a1a] text-white w-10 h-10 rounded-full flex items-center justify-center hover:scale-105 transition-transform"
              >
                <svg width="16" height="16" viewBox="0 0 12 12" fill="none">
                  <path d="M2.5 6h7M9.5 6L6 2.5M9.5 6L6 9.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </motion.div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4">
            <motion.button 
              whileHover={{ y: -2 }} 
              whileTap={{ scale: 0.98 }}
              onClick={onGetBot} 
              className="whatsapp-btn py-4 px-8 text-sm font-bold shadow-xl hover:shadow-green-500/20"
            >
              Get Your Free Bot
            </motion.button>
            <motion.a 
              whileHover={{ y: -2 }} 
              whileTap={{ scale: 0.98 }}
              href="https://whatsapp.com/channel/0029VaI3OXiF6smuq5LxxN15" 
              target="_blank" 
              rel="noopener noreferrer"
              className="bg-white/90 border border-black/10 text-[#1a1a1a] font-bold text-sm py-4 px-8 rounded-full hover:bg-white transition-all text-center flex items-center justify-center gap-2 shadow-sm"
            >
              Join Our Community
            </motion.a>
          </div>
        </div>
      </div>

      {/* 🤖 MASCOT ON TOP - Set to Z-50 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.7, x: 30 }} 
        animate={{ opacity: 1, scale: 1, x: 0 }}
        transition={{ duration: 1, delay: 0.6, type: 'spring', stiffness: 100 }}
        className="absolute bottom-[4vh] right-[2%] md:right-[5%] z-50 w-32 md:w-48 lg:w-56 floating pointer-events-none"
      >
        <img 
          src="/robot-mascot.png" 
          alt="Empire MD Bot Mascot" 
          loading="lazy"
          className="w-full h-auto drop-shadow-[0_15px_30px_rgba(0,0,0,0.2)]" 
        />
      </motion.div>

      {/* Footer Branding */}
      <div className="absolute bottom-8 left-8 md:left-12 z-20 font-mono text-[10px] text-[#8e8e8e] tracking-[0.2em] uppercase opacity-60">
        © 2026 Empire Digitals
      </div>
    </section>
  )
}
