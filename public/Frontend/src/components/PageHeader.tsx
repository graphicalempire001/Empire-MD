import { Link } from 'react-router'

export default function PageHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <header className="pt-28 pb-10 md:pt-36 md:pb-14 section-padding">
      <div className="max-w-3xl mx-auto">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#8e8e8e] hover:text-[#1a1a1a] transition-colors mb-6"
        >
          <span aria-hidden="true">←</span> empire<span className="text-[#00A884]">md</span>
        </Link>
        <p className="text-xs font-semibold text-[#00A884] uppercase tracking-widest mb-3">
          {eyebrow}
        </p>
        <h1 className="heading-lg text-[#1a1a1a]">{title}</h1>
      </div>
    </header>
  )
}
