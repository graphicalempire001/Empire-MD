import { useState } from 'react'
import { motion } from 'framer-motion'
import { Search, Eye } from 'lucide-react'
import PairingFlow from './PairingFlow'

export default function Hero() {
  const [pairOpen, setPairOpen] = useState(false)

  return (
    <section id="hero" className="relative min-h-screen w-full flex flex-col items-center justify-center overflow-hidden px-4">
      {/* Background Video Container */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <video
          className="w-full h-full object-cover"
          autoPlay
          loop
          muted
          playsInline
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260603_132049_036591b8-6e92-4760-b94c-a7ea6eef315c.mp4"
        />
        {/* Gradient mask top */}
        <div className="absolute top-0 inset-x-0 h-48 bg-gradient-to-b from-black/80 to-transparent" />
        {/* Gradient mask bottom */}
        <div className="absolute bottom-0 inset-x-0 h-48 bg-gradient-to-t from-black/90 to-transparent" />
        {/* Overall dark overlay for readability */}
        <div className="absolute inset-0 bg-black/40" />
      </div>

      {/* Hero Content */}
      <motion.div
        className="relative text-center max-w-4xl mx-auto"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        {/* Hero Header */}
        <h1 className="text-4xl sm:text-6xl md:text-7xl font-black text-white leading-[1.05] tracking-tight">
          Empire MD offers{' '}
          <span className="text-emerald-400">powerful</span>{' '}
          WhatsApp automation to help you manage your{' '}
          {/* Eye Icon Element */}
          <span className="inline-flex items-center align-middle mx-1">
            <span className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-white/10 border border-white/20 flex items-center justify-center backdrop-blur-sm">
              <Eye className="text-emerald-300" size={22} />
            </span>
          </span>{' '}
          bot.
        </h1>

        {/* Subtitle */}
        <p className="text-slate-300 mt-6 text-base sm:text-lg max-w-2xl mx-auto">
          No code. No servers. No stress. Just connect your number and Empire MD handles everything —
          media downloads, stickers, group management, AI chat, and more.
        </p>

        {/* Search Pill */}
        <div className="mt-8 mx-auto max-w-md flex items-center gap-2 bg-white/95 rounded-full p-1.5 pl-5 shadow-2xl">
          <Search className="text-slate-400 shrink-0" size={18} />
          <input
            type="text"
            placeholder="Ask about your WhatsApp bot..."
            className="flex-1 bg-transparent outline-none text-slate-800 placeholder:text-slate-400 text-sm"
            onKeyDown={(e) => { if (e.key === 'Enter') window.open('https://wa.me/2347086757575', '_blank') }}
          />
          <button
            onClick={() => window.open('https://wa.me/2347086757575', '_blank')}
            className="bg-[#1a1a1a] text-white w-9 h-9 rounded-full flex items-center justify-center shrink-0 hover:bg-[#333] transition-colors"
            aria-label="Chat on WhatsApp"
          >
            <Search size={16} />
          </button>
        </div>

        {/* CTA Buttons */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={() => setPairOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-8 py-4 rounded-full transition-all shadow-lg"
          >
            Get Your Free Bot
          </button>
          <a
            href="#features"
            className="border border-white/30 hover:border-emerald-400 text-white font-semibold px-8 py-4 rounded-full transition-all backdrop-blur-sm"
          >
            Explore Features
          </a>
        </div>
      </motion.div>

      {/* Floating Robot */}
      <motion.img
        src="/robot-mascot.png"
        alt="Empire MD Bot"
        className="relative w-36 sm:w-44 mt-14 drop-shadow-2xl"
        animate={{ y: [0, -14, 0] }}
        transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
      />

      {/* Edge Anchors */}
      <div className="absolute bottom-6 left-6 hidden md:flex flex-col gap-1 text-xs text-white/60">
        <span className="hover:text-white cursor-pointer">en</span>
        <span className="hover:text-white cursor-pointer">fr</span>
      </div>
      <div className="absolute bottom-6 right-6 hidden md:block text-xs text-white/60 text-right">
        <p>2024</p>
        <p>whatsapp automation tools</p>
      </div>

      {/* Pairing modal */}
      <PairingFlow open={pairOpen} onClose={() => setPairOpen(false)} />
    </section>
  )
}
