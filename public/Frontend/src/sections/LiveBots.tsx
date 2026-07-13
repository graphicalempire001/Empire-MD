import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, CircleDot, Phone, Calendar, ChevronDown } from 'lucide-react'

interface LiveBot {
  bot_name: string
  phone_number: string
  status: string
  created_at: string
}

export default function LiveBots() {
  const [bots, setBots] = useState<LiveBot[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/public-directory')
      const data = await res.json()
      if (data.success && Array.isArray(data.bots)) setBots(data.bots)
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [])

  const visible = expanded ? bots : bots.slice(0, 5)
  const hasMore = bots.length > 5

  const BotCard = ({ bot, i }: { bot: LiveBot; i: number }) => (
    <motion.div
      layout
      initial={{ opacity: 0, y: -30, scale: 0.8, rotate: -4 }}
      animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20, delay: (i % 5) * 0.06 }}
      className="glass-card rounded-2xl p-5 relative overflow-hidden"
    >
      <div className="absolute top-4 right-4 flex items-center gap-1 text-[11px] font-medium text-[#00A884]">
        <CircleDot size={12} className="animate-pulse" /> {bot.status || 'Online'}
      </div>
      <div className="w-11 h-11 rounded-xl bg-[#00A884]/10 flex items-center justify-center mb-3">
        <Bot size={22} className="text-[#00A884]" />
      </div>
      <h3 className="heading-md text-lg text-[#1a1a1a] mb-2 truncate">{bot.bot_name}</h3>
      <div className="flex items-center gap-2 body-text text-xs mb-1">
        <Phone size={13} /> {bot.phone_number}
      </div>
      <div className="flex items-center gap-2 body-text text-xs">
        <Calendar size={13} /> {new Date(bot.created_at).toLocaleDateString()}
      </div>
    </motion.div>
  )

  return (
    <section className="section-padding py-20" style={{ backgroundColor: '#EDEEF5' }}>
      <div className="max-w-6xl mx-auto text-center">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#00A884] uppercase tracking-wider mb-2">
          <CircleDot size={12} className="animate-pulse" /> Live Status
        </span>
        <h2 className="heading-lg text-[#1a1a1a] mb-3">Active <span className="text-gradient-green">Empire Bots</span></h2>
        <p className="body-text max-w-lg mx-auto mb-10">Real-time registry of bots running on the Empire network.</p>

        {loading && bots.length === 0 ? (
          <p className="body-text">Loading live registry…</p>
        ) : bots.length === 0 ? (
          <p className="body-text">No active bots online right now.</p>
        ) : (
          <>
            <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 text-left">
              <AnimatePresence>
                {visible.map((bot, i) => (
                  <BotCard key={`${bot.bot_name}-${i}`} bot={bot} i={i} />
                ))}
              </AnimatePresence>
            </motion.div>

            {hasMore && (
              <motion.button
                whileHover={{ y: -2, scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => setExpanded((e) => !e)}
                className="whatsapp-btn inline-flex items-center gap-2 mt-10 px-8 py-3.5 text-sm"
              >
                {expanded ? 'Show Less' : `View More (${bots.length - 5})`}
                <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ type: 'spring', stiffness: 300 }}>
                  <ChevronDown size={16} />
                </motion.span>
              </motion.button>
            )}
          </>
        )}
      </div>
    </section>
  )
}
