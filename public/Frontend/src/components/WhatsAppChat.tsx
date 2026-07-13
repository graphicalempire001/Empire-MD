import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, X, Send } from 'lucide-react'

const WA_NUMBER = '2347086757575' // your WhatsApp number

export default function WhatsAppChat() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const send = () => {
    const msg = text.trim()
    if (!msg) return
    // Only on send: forward the typed message into a real WhatsApp chat
    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank')
    setText('')
    setOpen(false)
  }

  return (
    <>
      {/* Chat Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            className="fixed bottom-24 right-5 md:right-8 z-[90] w-[88vw] max-w-sm rounded-2xl overflow-hidden shadow-2xl glass-card"
          >
            {/* Header */}
            <div className="bg-gradient-green px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                <MessageCircle size={18} className="text-white" />
              </div>
              <div className="flex-1">
                <p className="text-white font-semibold text-sm leading-tight">Empire MD Support</p>
                <p className="text-white/80 text-[11px]">Typically replies instantly</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white transition-colors" aria-label="Close chat">
                <X size={18} />
              </button>
            </div>

            {/* Message area */}
            <div className="px-4 py-5 bg-white/50 min-h-[140px] flex flex-col gap-2">
              <div className="self-start max-w-[80%] bg-white rounded-2xl rounded-tl-sm px-3 py-2 shadow-sm">
                <p className="text-[13px] text-[#1a1a1a]">👋 Hi there! Type your message below and we'll continue on WhatsApp.</p>
              </div>
            </div>

            {/* Input bar */}
            <div className="p-2 bg-white/70 border-t border-black/[0.06] flex items-center gap-2">
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="Type a message…"
                className="flex-1 bg-white border border-black/[0.06] rounded-full px-4 py-2.5 text-sm text-[#1a1a1a] placeholder-[#8e8e8e] outline-none focus:border-[#00A884] transition-colors"
              />
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={send}
                disabled={!text.trim()}
                className="w-10 h-10 rounded-full bg-gradient-green flex items-center justify-center text-white shrink-0 disabled:opacity-50"
                aria-label="Send"
              >
                <Send size={16} />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Button */}
      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-5 md:right-8 z-[95] w-14 h-14 rounded-full bg-gradient-green flex items-center justify-center shadow-lg glow-green"
        aria-label="Open chat"
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.span key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
              <X size={24} className="text-white" />
            </motion.span>
          ) : (
            <motion.span key="c" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}>
              <MessageCircle size={24} className="text-white" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </>
  )
}
