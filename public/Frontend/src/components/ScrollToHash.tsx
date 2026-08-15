import { useEffect } from 'react'
import { useLocation } from 'react-router'

/** Mounted once near the router root. Scrolls to the element matching the
 * URL hash whenever the location changes — including when navigating from
 * a different page back to "/#pricing" etc, where the target section only
 * exists after Landing has mounted. */
export default function ScrollToHash() {
  const location = useLocation()

  useEffect(() => {
    if (!location.hash) return
    const id = location.hash.slice(1)
    // Give the target page a moment to mount (e.g. navigating from /help to /#pricing).
    const t = setTimeout(() => {
      const el = document.getElementById(id)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
    return () => clearTimeout(t)
  }, [location.pathname, location.hash])

  return null
}
