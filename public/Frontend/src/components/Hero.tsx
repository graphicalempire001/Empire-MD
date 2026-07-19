import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'

interface HeroProps {
  onGetBot: () => void
  onOpenChat: () => void
}

export default function Hero({ onGetBot, onOpenChat }: HeroProps) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    // Detect mobile to reduce heavy animation load
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  return (
    <section
      className="relative min-h-[100vh] sm:min-h-[140vh] w-full flex flex-col items-center justify-start overflow-hidden"
      style={{ backgroundColor: '#EDEEF5' }}
    >
      {/* Background Layer - Optimized for Speed */}
      <div className="absolute top-[10vh] sm:top-[18vh] left-0 w-full h-[85vh] sm:h-[115vh] z-0 pointer-events-none">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-20"
          style={{ backgroundImage: "url('/hero-bg.jpg')" }}
        ></div>
        <div className="absolute inset-0 bg-[#EDEEF5]/60"></div>

        {/* Video: Added preload="metadata" to stop it from choking the initial page load */}
        <video
          autoPlay loop muted playsInline
          preload="metadata"
          className="relative w-full h-full object-cover opacity-80"
          poster="/hero-bg.jpg"
        >
          <source
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260603_132049_036591b8-6e92-4760-b94c-a7ea6eef315c.mp4"
            type="video/mp4"
          />
        </video>

        <div className="absolute bottom-0 left-0 w-full h-32 sm:h-48 bg-gradient-to-t from-[#EDEEF5] to-transparent"></div>
      </div>

      {/* Hero Content */}
      <div className="max-w-7xl w-full mx-auto px-6 md:px-16 lg:px-20 relative z-10 grid grid-cols-12 gap-x-4 md:gap-x-8 pt-24 sm:pt-36">
        <div className="col-span-12 md:col-span-10 md:col-start-2">
          <motion.h1
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.5 }}
            className="heading-xl mb-6"
          >
            <span className="text-[#1a1a1a]">Empire</span>{' '}
            <span className="text-[#8e8e8e]">MD</span>
            <br />
            <span className="text-[#8e8e8e]">Launch Your Free Whatsapp</span>
            <br />
            <span className="text-[#8e8e8e]">Bot in 30</span>
            <span className="inline-flex items-center justify-center w-[16px] md:w-[42px] lg:w-[62px] h-[16px] md:h-[42px] lg:h-[62px] border-[2px] border-[#1a1a1a] rounded-full mx-1 align-middle">
              <span className="w-2 h-2 bg-[#1a1a1a] rounded-full"></span>
            </span>
            <span className="text-[#1a1a1a]">seconds.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            transition={{ duration: 0.5, delay: 0.1 }}
            className="body-text max-w-lg mb-8 text-[#1a1a1a]"
          >
            No code. No servers. No stress. Just connect your number and Empire MD handles everything —
            media downloads, stickers, group management, AI chat, and more.
          </motion.p>

          {/* Search Pill */}
          <motion.div
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mb-8"
          >
            <div className="bg-white/90 backdrop-blur-md rounded-[6px] border border-black/[0.05] p-1 pl-4 flex items-center shadow-sm max-w-md">
              <input
                type="text"
                placeholder="Ask me anything..."
                className="flex-1 bg-transparent text-sm text-[#1a1a1a] placeholder-[#8e8e8e] outline-none py-2.5 cursor-pointer"
                readOnly
                onClick={onOpenChat}
              />
              <button
                onClick={onOpenChat}
                className="bg-[#1a1a1a] text-white w-9 h-9 rounded-full flex items-center justify-center shrink-0 hover:bg-[#333] transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                  <path d="M2.5 6h7M9.5 6L6 2.5M9.5 6L6 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </motion.div>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-3"
          >
            <motion.button
              whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}
              onClick={onGetBot}
              className="whatsapp-btn inline-flex items-center justify-center gap-2 text-sm py-3.5 px-7"
            >
              Get Your Free Bot
            </motion.button>
            <motion.a
              whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}
              href="https://whatsapp.com/channel/0029VaI3OXiF6smuq5LxxN15"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-white/90 border border-black/[0.06] text-[#1a1a1a] font-semibold text-sm py-3.5 px-7 rounded-full hover:bg-white transition-colors"
            >
              Join Our Community
            </motion.a>
          </motion.div>
        </div>
      </div>

      {/* Floating Robot - Hidden on Mobile to prevent UI Lag */}
      {!isMobile && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }} 
          animate={{ opacity: 1, scale: 1 }} 
          transition={{ duration: 0.8, delay: 0.5 }}
          className="absolute bottom-[8vh] right-[5%] md:right-[10%] z-10 w-40 md:w-56 lg:w-72 floating"
        >
          <img 
            src="/robot-mascot.png" 
            alt="Empire MD Bot" 
            loading="lazy"
            className="w-full h-auto mascot-shadow" 
          />
        </motion.div>
      )}

      {/* Social/Status Indicators */}
      <div className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 z-20 hidden lg:block">
        <div className="glass-card rounded-full px-3 py-2 flex flex-col gap-1 text-[10px] font-medium text-[#8e8e8e]">
          <span className="text-[#1a1a1a] font-semibold cursor-pointer">en</span>
          <span className="w-3 h-[1px] bg-black/10 mx-auto"></span>
          <span className="cursor-pointer hover:text-[#1a1a1a] transition-colors">fr</span>
        </div>
      </div>

      <div className="absolute bottom-6 left-6 md:left-10 z-20 opacity-40">
        <span className="text-[10px] font-medium text-[#8e8e8e] tracking-wider">2026</span>
      </div>
      <div className="absolute bottom-6 right-6 md:right-10 z-20 opacity-40">
        <span className="text-[10px] font-medium text-[#8e8e8e] tracking-wider lowercase">whatsapp automation</span>
      </div>
    </section>
  )
}
