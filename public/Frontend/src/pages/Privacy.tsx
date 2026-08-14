import { useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { COMMANDS, DEFAULT_PREFIX, WA_NUMBER } from '../components/siteChatKnowledge'

const PLAN_LABEL: Record<string, string> = {
  free: 'Free',
  premium: 'Premium',
  owner: 'Owner',
}

const PLAN_COLOR: Record<string, string> = {
  free: 'text-[#00A884] bg-[#00A884]/10',
  premium: 'text-[#1a1a1a] bg-[#9fff00]/40',
  owner: 'text-[#8e8e8e] bg-black/5',
}

export default function HelpCenter() {
  const [query, setQuery] = useState('')
  const [openCmd, setOpenCmd] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return COMMANDS
    return COMMANDS.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.aliases.some((a) => a.toLowerCase().includes(q)) ||
        c.short.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q)
    )
  }, [query])

  const grouped = useMemo(() => {
    const map = new Map<string, typeof COMMANDS>()
    filtered.forEach((c) => {
      const list = map.get(c.category) || []
      list.push(c)
      map.set(c.category, list)
    })
    return Array.from(map.entries())
  }, [filtered])

  return (
    <div className="min-h-screen">
      <PageHeader eyebrow="Support" title="Help Center" />
      <main className="section-padding pb-24">
        <div className="max-w-3xl mx-auto">
          <p className="body-text mb-8">
            Every command Empire MD understands, what it does, and how to use it. Prefix defaults to{' '}
            <code className="text-[#1a1a1a] bg-black/5 px-1.5 py-0.5 rounded">{DEFAULT_PREFIX}</code> — change
            yours with <code className="text-[#1a1a1a] bg-black/5 px-1.5 py-0.5 rounded">.setprefix</code>.
          </p>

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands — e.g. sticker, antilink, receipt…"
            className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm mb-10 outline-none focus:border-[#00A884] transition-colors"
          />

          {grouped.length === 0 && (
            <p className="body-text">
              No commands match "{query}". Try a different term, or ask on{' '}
              <a href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noopener noreferrer" className="text-[#00A884] hover:underline">
                WhatsApp
              </a>
              .
            </p>
          )}

          {grouped.map(([category, cmds]) => (
            <section key={category} className="mb-10">
              <h2 className="text-xs font-bold text-[#1a1a1a] uppercase tracking-wider mb-4">
                {category}
              </h2>
              <div className="space-y-2">
                {cmds.map((c) => {
                  const isOpen = openCmd === c.name
                  return (
                    <div key={c.name} className="glass-card rounded-xl overflow-hidden">
                      <button
                        onClick={() => setOpenCmd(isOpen ? null : c.name)}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-display font-semibold text-sm text-[#1a1a1a]">
                              {DEFAULT_PREFIX}{c.name}
                            </span>
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${PLAN_COLOR[c.plan]}`}>
                              {PLAN_LABEL[c.plan]}
                            </span>
                          </div>
                          <p className="text-xs text-[#8e8e8e] mt-0.5 truncate">{c.short}</p>
                        </div>
                        <span className="text-[#8e8e8e] shrink-0">{isOpen ? '−' : '+'}</span>
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-4 pt-1 border-t border-black/[0.06] space-y-2">
                          <p className="text-xs text-[#8e8e8e]">
                            <span className="text-[#1a1a1a] font-medium">Usage: </span>
                            {c.usage}
                          </p>
                          <p className="text-xs text-[#8e8e8e]">
                            <span className="text-[#1a1a1a] font-medium">How it works: </span>
                            {c.howItWorks}
                          </p>
                          {c.aliases.length > 0 && (
                            <p className="text-xs text-[#8e8e8e]">
                              <span className="text-[#1a1a1a] font-medium">Aliases: </span>
                              {c.aliases.map((a) => `${DEFAULT_PREFIX}${a}`).join(', ')}
                            </p>
                          )}
                          {c.tips && (
                            <p className="text-xs text-[#8e8e8e]">
                              <span className="text-[#1a1a1a] font-medium">Tip: </span>
                              {c.tips}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          ))}

          <div className="glass-card rounded-2xl p-6 mt-4">
            <h3 className="heading-md text-[#1a1a1a] mb-2">Still stuck?</h3>
            <p className="body-text mb-4">
              Reach a real person — support usually replies fast.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href={`https://wa.me/${WA_NUMBER}`}
                target="_blank"
                rel="noopener noreferrer"
                className="whatsapp-btn text-sm"
              >
                Message on WhatsApp
              </a>
              <a
                href="https://t.me/BOTWAN_SUPPORT"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary text-sm"
              >
                Message on Telegram
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
