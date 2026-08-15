import { Puzzle } from 'lucide-react'
import PageHeader from '../components/PageHeader'

export default function Plugins() {
  return (
    <div className="min-h-screen">
      <PageHeader eyebrow="Coming Soon" title="Plugins" />
      <main className="section-padding pb-24">
        <div className="max-w-md mx-auto text-center glass-card rounded-2xl p-10">
          <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-[#00A884]/10 flex items-center justify-center">
            <Puzzle className="text-[#00A884]" />
          </div>
          <h2 className="heading-md text-[#1a1a1a] mb-2">Building the plugin marketplace</h2>
          <p className="body-text">
            Install extra command packs for your bot — sports, office tools, custom flows — without
            waiting on a full update. Not live yet, but it's on the roadmap.
          </p>
        </div>
      </main>
    </div>
  )
}
