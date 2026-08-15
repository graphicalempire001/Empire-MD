import PageHeader from '../components/PageHeader'

interface Component {
  name: string
  description: string
}

const COMPONENTS: Component[] = [
  { name: 'Pairing & Website', description: 'empirebot.space — generating pairing codes and serving the site' },
  { name: 'WhatsApp Bot Sessions', description: 'Active bots relaying and responding to messages' },
  { name: 'Payments', description: 'Flutterwave checkout and Premium activation' },
  { name: 'AI Commands', description: '.ai, .cs, and other AI-powered replies' },
]

export default function Status() {
  return (
    <div className="min-h-screen">
      <PageHeader eyebrow="Support" title="Status" />
      <main className="section-padding pb-24">
        <div className="max-w-3xl mx-auto">
          <div className="glass-card rounded-2xl p-5 mb-10 flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00A884] opacity-60" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#00A884]" />
            </span>
            <p className="text-sm text-[#1a1a1a] font-medium">All systems operational</p>
          </div>

          <div className="space-y-3 mb-12">
            {COMPONENTS.map((c) => (
              <div
                key={c.name}
                className="flex items-center justify-between gap-4 py-3 px-4 rounded-xl bg-white border border-black/[0.06]"
              >
                <div>
                  <p className="text-sm font-medium text-[#1a1a1a]">{c.name}</p>
                  <p className="text-xs text-[#8e8e8e] mt-0.5">{c.description}</p>
                </div>
                <span className="shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full bg-[#00A884]/10 text-[#00A884]">
                  Operational
                </span>
              </div>
            ))}
          </div>

          <div className="glass-card rounded-2xl p-6">
            <h3 className="heading-md text-[#1a1a1a] mb-2">A note on this page</h3>
            <p className="body-text mb-4">
              This reflects our own team's awareness of the system, not an automated live monitor. If
              your bot is disconnecting, stuck pairing, or a command isn't responding, that's often
              specific to your session rather than a wider outage — the fastest way to check is asking
              directly. We post real incidents to Telegram as they happen.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href="https://t.me/BOTWAN_SUPPORT"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary text-sm"
              >
                Check Telegram
              </a>
              <a
                href="https://wa.me/2347086757575"
                target="_blank"
                rel="noopener noreferrer"
                className="whatsapp-btn text-sm"
              >
                Report an issue
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
