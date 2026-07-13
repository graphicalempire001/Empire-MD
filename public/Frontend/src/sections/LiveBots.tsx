import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, CircleDot, Phone, Calendar, RefreshCw } from 'lucide-react';

interface LiveBot {
  bot_name: string;
  phone_number: string;
  status: string;
  created_at: string;
}

export default function LiveBots() {
  const [bots, setBots] = useState<LiveBot[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/public-directory');
      const data = await res.json();
      if (data.success && Array.isArray(data.bots)) setBots(data.bots);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // refresh every 30s
    return () => clearInterval(t);
  }, []);

  return (
    <section id="live-bots" className="relative py-24 px-4 sm:px-8 overflow-hidden">
      <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="max-w-6xl mx-auto relative">
        <div className="text-center mb-14">
          <span className="text-emerald-400 text-sm font-semibold uppercase tracking-wider">Live Status</span>
          <h2 className="text-4xl sm:text-5xl font-black text-white mt-2">Active Empire Bots</h2>
          <p className="text-slate-400 mt-4 max-w-xl mx-auto">
            Real-time registry of bots running on the Empire network.
          </p>
          <button onClick={load} className="mt-4 text-xs text-slate-500 hover:text-white inline-flex items-center gap-1">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {loading && bots.length === 0 ? (
          <p className="text-center text-slate-500">Loading live registry…</p>
        ) : bots.length === 0 ? (
          <p className="text-center text-slate-500">No active bots online right now.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {bots.map((bot, i) => (
              <motion.div
                key={`${bot.bot_name}-${i}`}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: (i % 6) * 0.06 }}
                whileHover={{ y: -6, scale: 1.02 }}
                className="group bg-slate-900/60 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-5 backdrop-blur-xl transition-colors"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-11 h-11 bg-emerald-500/15 rounded-xl flex items-center justify-center">
                    <Bot className="text-emerald-400" size={22} />
                  </div>
                  <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full">
                    <CircleDot size={11} className="animate-pulse" /> {bot.status || 'Online'}
                  </span>
                </div>
                <h3 className="text-white font-bold text-lg truncate">{bot.bot_name}</h3>
                <div className="mt-3 space-y-1.5 text-sm text-slate-400">
                  <p className="flex items-center gap-2"><Phone size={13} className="text-slate-600" /> {bot.phone_number}</p>
                  <p className="flex items-center gap-2"><Calendar size={13} className="text-slate-600" /> {new Date(bot.created_at).toLocaleDateString()}</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
