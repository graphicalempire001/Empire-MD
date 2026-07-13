import { motion } from 'framer-motion'

export default function Hero() {
  // Tap → open the onboarding session / code generator.
  const handleGetBot = () => {
    window.location.href = '/connect'
  }

  return (
    <section
      className="relative min-h-[110vh] sm:min-h-[140vh] w-full flex flex-col items-center justify-start overflow-hidden"
      style={{ backgroundColor: '#EDEEF5' }}
    >
      {/* Background Layer */}
      <div className="absolute top-[12vh] sm:top-[18vh] left-0 w-full h-[90vh] sm:h-[115vh] z-0 pointer-events-none">
        {/* Soft static background image — kept faint so it never darkens the edges */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-25"
          style={{ backgroundImage: "url('/hero-bg.jpg')" }}
        ></div>
        {/* Strong light wash over the image */}
        <div className="absolute inset-0 bg-[#EDEEF5]/60"></div>

        {/* Background Video */}
        <video
          autoPlay
          loop
          muted
          playsInline
          className="relative w-full h-full object-cover opacity-90"
          poster="/hero-bg.jpg"
        >
          <source
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260603_132049_036591b8-6e92-4760-b94c-a7ea6eef315c.mp4"
            type="video/mp4"
          />
        </video>

        {/* Four-side light fades into #EDEEF5 (removes every dark edge) */}
        <div className="absolute top-0 left-0 w-full h-24 sm:h-32 bg-gradient-to-b from-[#EDEEF5] to-transparent"></div>
        <div className="absolute bottom-0 left-0 w-full h-32 sm:h-48 bg-gradient-to-t from-[#EDEEF5] to-transparent"></div>
        <div className="absolute top-0 left-0 h-full w-16 sm:w-24 bg-gradient-to-r from-[#EDEEF5] to-transparent"></div>
        <div className="absolute top-0 right-0 h-full w-16 sm:w-24 bg-gradient-to-l from-[#EDEEF5] to-transparent"></div>
      </div>

      {/* Hero Content */}
      <div className="max-w-7xl w-full mx-auto px-6 md:px-16 lg:px-20 relative z-10 grid grid-cols-12 gap-x-4 md:gap-x-8 pt-28 sm:pt-36">
        <div className="col-span-12 md:col-span-10 md:col-start-2">
          {/* Hero Header */}
          <motion.h1
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="heading-xl mb-6"
          >
            <span className="text-[#1a1a1a]">Empire MD offers</span>{' '}
            <span className="text-[#8e8e8e]">powerful</span>
            <br />
            <span className="text-[#8e8e8e]">WhatsApp automation to help you</span>
            <br />
            <span className="text-[#8e8e8e]">manage your </span>
            <span className="inline-flex items-center justify-center w-[16px] md:w-[42px] lg:w-[62px] h-[16px] md:h-[42px] lg:h-[62px] border-[2px] border-[#1a1a1a] rounded-full mx-1 align-middle">
              <span className="w-2 h-2 bg-[#1a1a1a] rounded-full"></span>
            </span>
            <span className="text-[#1a1a1a]"> bot.</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="body-text max-w-lg mb-8"
          >
            No code. No servers. No stress. Just connect your number and Empire MD handles everything —
            media downloads, stickers, group management, AI chat, and more.
          </motion.p>

          {/* Search Pill */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.15 }}
            className="mb-8"
          >
            <div className="bg-white rounded-[6px] border border-black/[0.05] p-1 pl-4 flex items-center shadow-sm max-w-md">
              <input
                type="text"
                placeholder="Ask me anything..."
                className="flex-1 bg-transparent text-sm text-[#1a1a1a] placeholder-[#8e8e8e] outline-none py-2.5"
                readOnly
                onClick={() => window.open('https://wa.me/2347086757575', '_blank')}
              />
              <button
                onClick={() => window.open('https://wa.me/2347086757575', '_blank')}
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
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="flex flex-col sm:flex-row gap-3"
          >
            <button
              onClick={handleGetBot}
              className="whatsapp-btn inline-flex items-center justify-center gap-2 text-sm py-3.5 px-7"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Get Your Free Bot
            </button>
            <a
              href="#features"
              className="inline-flex items-center justify-center gap-2 bg-white/80 border border-black/[0.06] text-[#1a1a1a] font-semibold text-sm py-3.5 px-7 rounded-full hover:bg-white transition-all"
            >
              Explore Features
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 6h7M9.5 6L6 2.5M9.5 6L6 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
          </motion.div>
        </div>
      </div>

      {/* Floating Robot */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1, delay: 0.4 }}
        className="absolute bottom-[8vh] right-[5%] md:right-[10%] z-10 w-40 md:w-56 lg:w-72 floating"
      >
        <img src="/robot-mascot.png" alt="Empire MD Bot" className="w-full h-auto mascot-shadow" />
      </motion.div>

      {/* Edge Anchors */}
      <div className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 z-20 hidden lg:block">
        <div className="glass-card rounded-full px-3 py-2 flex flex-col gap-1 text-[10px] font-medium text-[#8e8e8e]">
          <span className="text-[#1a1a1a] font-semibold cursor-pointer">en</span>
          <span className="w-3 h-[1px] bg-black/10 mx-auto"></span>
          <span className="cursor-pointer hover:text-[#1a1a1a] transition-colors">fr</span>
        </div>
      </div>

      <div className="absolute bottom-6 left-6 md:left-10 z-20">
        <span className="text-[10px] font-medium text-[#8e8e8e] tracking-wider">2024</span>
      </div>

      <div className="absolute bottom-6 right-6 md:right-10 z-20">
        <span className="text-[10px] font-medium text-[#8e8e8e] tracking-wider lowercase">whatsapp automation tools</span>
      </div>
    </section>
  )
}
