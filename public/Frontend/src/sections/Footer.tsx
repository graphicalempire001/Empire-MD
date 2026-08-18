import { Link } from 'react-router'

export default function Footer() {
  return (
    <footer className="relative py-12 md:py-16 border-t border-black/[0.06]" style={{ backgroundColor: '#EDEEF5' }}>
      <div className="max-w-7xl mx-auto section-padding">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12">
          {/* Brand */}
          <div className="md:col-span-4">
            <div className="flex items-center gap-2 mb-4">
              <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
                <circle cx="14" cy="14" r="10" fill="#1a1a1a"/>
                <circle cx="14" cy="14" r="3" fill="#9fff00"/>
              </svg>
              <span className="font-display font-bold text-base tracking-tight text-[#1a1a1a]">
                Empire<span className="text-[#00A884]">MD</span>
              </span>
            </div>
            <p className="text-xs text-[#8e8e8e] leading-relaxed max-w-xs">
              Powerful WhatsApp automation bots for everyone. No coding required. Get your personal bot in under 2 minutes.
            </p>
          </div>

          {/* Links */}
          <div className="md:col-span-2">
            <h4 className="text-xs font-bold text-[#1a1a1a] uppercase tracking-wider mb-4">Product</h4>
            <ul className="space-y-2.5">
              <li>
                <a href="/#features" className="text-xs text-[#8e8e8e] hover:text-[#1a1a1a] transition-colors">
                  Features
                </a>
              </li>
              <li>
                <a href="/#pricing" className="text-xs text-[#8e8e8e] hover:text-[#1a1a1a] transition-colors">
                  Pricing
                </a>
              </li>
              <li>
                <Link to="/class" className="text-xs text-[#00A884] hover:text-[#008f72] transition-colors font-medium">
                  Robot Class
                </Link>
              </li>
              <li>
                <a href="/#commands" className="text-xs text-[#8e8e8e] hover:text-[#1a1a1a] transition-colors">
                  Commands
                </a>
              </li>
            </ul>
          </div>

          <div className="md:col-span-2">
            <h4 className="text-xs font-bold text-[#1a1a1a] uppercase tracking-wider mb-4">Support</h4>
            <ul className="space-y-2.5">
              {[
                { label: 'Help Center', to: '/help' },
                { label: 'Contact Us', href: 'https://wa.me/2347086757575' },
                { label: 'Status', to: '/status' },
              ].map((item) =>
                item.to ? (
                  <li key={item.label}>
                    <Link to={item.to} className="text-xs text-[#8e8e8e] hover:text-[#1a1a1a] transition-colors">
                      {item.label}
                    </Link>
                  </li>
                ) : (
                  <li key={item.label}>
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#8e8e8e] hover:text-[#1a1a1a] transition-colors"
                    >
                      {item.label}
                    </a>
                  </li>
                )
              )}
            </ul>
          </div>

          <div className="md:col-span-2">
            <h4 className="text-xs font-bold text-[#1a1a1a] uppercase tracking-wider mb-4">Community</h4>
            <ul className="space-y-2.5">
              <li>
                <a
                  href="https://whatsapp.com/channel/0029VaI3OXiF6smuq5LxxN15"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#8e8e8e] hover:text-[#1a1a1a] transition-colors"
                >
                  WhatsApp Channel
                </a>
              </li>
              <li>
                <a
                  href="https://t.me/BOTWAN_SUPPORT"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#8e8e8e] hover:text-[#1a1a1a] transition-colors"
                >
                  Telegram
                </a>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div className="md:col-span-2">
            <h4 className="text-xs font-bold text-[#1a1a1a] uppercase tracking-wider mb-4">Contact</h4>
            <a
              href="https://wa.me/2347086757575"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs text-[#00A884] hover:text-[#008f72] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              +234 708 675 7575
            </a>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-6 border-t border-black/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[11px] text-[#8e8e8e]">
            &copy; {new Date().getFullYear()} Empire Digitals. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <Link to="/privacy" className="text-[11px] text-[#8e8e8e] hover:text-[#1a1a1a] transition-colors">Privacy</Link>
            <Link to="/terms" className="text-[11px] text-[#8e8e8e] hover:text-[#1a1a1a] transition-colors">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
