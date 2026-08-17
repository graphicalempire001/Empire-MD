import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Lock, Trash2, Flag, RefreshCw, CheckSquare, Square, ShieldCheck,
  Pause, Play, Download, Search, Users, CreditCard, Bot as BotIcon,
  ShieldPlus, ShieldMinus, Ticket, Copy, Ban,
} from 'lucide-react'

interface AdminBot {
  session_id: string
  bot_name: string
  phone_number: string
  status: string
  created_at?: string | null
  message_count?: number
  command_count?: number
  is_abusive?: boolean
}

interface Payment {
  id?: string
  session_id: string | null
  phone_number: string
  amount: number
  currency: string
  provider: string
  reference: string
  status: string
  paid_at: string
  metadata?: { months?: number }
}

interface Subscriber {
  phone_number: string
  plan: string
  plan_expires_at: string | null
  is_whitelisted: boolean
  whitelist_reason?: string | null
  bot_name?: string | null
  session_id?: string | null
  status?: string | null
}

interface SystemStats {
  activeBots: number
  disk: { usePercent: number; availMB?: number; totalMB?: number }
  ram: { usePercent: number; freeMB?: number; usedMB?: number; totalMB?: number }
  reserveThreshold: number
}

interface Coupon {
  code: string
  days: number
  max_uses: number
  uses_count: number
  active: boolean
  expires_at: string | null
  note: string | null
  created_by: string | null
  created_at: string
}

type StatusFilter = 'all' | 'online' | 'offline'
type Tab = 'bots' | 'payments' | 'subscribers' | 'coupons'

export default function AdminDashboard() {
  const [key, setKey] = useState(() => sessionStorage.getItem('empiremd_admin_key') || '')
  const [authed, setAuthed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  const [bots, setBots] = useState<AdminBot[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')

  const [stats, setStats] = useState<SystemStats>({
    activeBots: 0,
    disk: { usePercent: 0 },
    ram: { usePercent: 0 },
    reserveThreshold: 90,
  })
  const [pairingPaused, setPairingPaused] = useState(false)

  const [tab, setTab] = useState<Tab>('bots')
  const [payments, setPayments] = useState<Payment[]>([])
  const [paymentsLoading, setPaymentsLoading] = useState(false)
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [subSearch, setSubSearch] = useState('')
  const [subLoading, setSubLoading] = useState(false)
  const [whitelistPhone, setWhitelistPhone] = useState('')
  const [whitelistReason, setWhitelistReason] = useState('')
  const [grantPhone, setGrantPhone] = useState('')
  const [grantDays, setGrantDays] = useState('30')
  const [granting, setGranting] = useState(false)

  const [vcfFrom, setVcfFrom] = useState('')
  const [vcfTo, setVcfTo] = useState('')
  const [vcfOnlineOnly, setVcfOnlineOnly] = useState(false)
  const [vcfPreview, setVcfPreview] = useState('')
  const [vcfOpen, setVcfOpen] = useState(false)

  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [couponsLoading, setCouponsLoading] = useState(false)
  const [newCouponDays, setNewCouponDays] = useState('3')
  const [newCouponUses, setNewCouponUses] = useState('1')
  const [newCouponNote, setNewCouponNote] = useState('')
  const [creatingCoupon, setCreatingCoupon] = useState(false)

  const headers = { 'Content-Type': 'application/json', 'x-admin-key': key }
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2800) }

  useEffect(() => {
    const to = new Date()
    const from = new Date(Date.now() - 7 * 864e5)
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    setVcfTo(iso(to))
    setVcfFrom(iso(from))
  }, [])

  const loadAll = useCallback(async (silent = false) => {
    if (!key) return
    if (!silent) setLoading(true)
    setError('')
    try {
      const statusRes = await fetch(`/api/admin/status`, { headers: { 'x-admin-key': key } })
      if (statusRes.status === 403) throw new Error('Wrong admin password.')
      const statusData = await statusRes.json()
      if (statusData.success) {
        setStats({
          activeBots: statusData.activeBots || 0,
          disk: statusData.disk || { usePercent: 0 },
          ram: statusData.ram || { usePercent: 0 },
          reserveThreshold: statusData.reserveThreshold || 90,
        })
        setPairingPaused(!!statusData.pairingPaused)
      }

      let botsUrl = '/api/admin/bots'
      if (statusFilter !== 'all') botsUrl += `?status=${statusFilter}`
      const botsRes = await fetch(botsUrl, { headers: { 'x-admin-key': key } })
      if (botsRes.status === 403) throw new Error('Wrong admin password.')
      const botsData = await botsRes.json()
      if (botsData.success) {
        setBots(botsData.bots || [])
        setAuthed(true)
        sessionStorage.setItem('empiremd_admin_key', key)
      } else {
        setError(botsData.error || 'Failed to load bots')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Network error.'
      setError(msg)
      if (msg.includes('Wrong admin password')) { setAuthed(false); sessionStorage.removeItem('empiremd_admin_key') }
    } finally {
      setLoading(false)
    }
  }, [key, statusFilter])

  // Re-authenticate silently on refresh if a key was saved from a previous
  // successful login — fixes "refreshing logs me out". Kept in sessionStorage
  // (cleared when the tab/browser closes) rather than localStorage (persists
  // indefinitely), so a refresh survives but the key doesn't linger forever
  // on a shared device.
  useEffect(() => {
    if (key) loadAll()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!authed) return
    loadAll(true)
    const t = setInterval(() => loadAll(true), 15000)
    return () => clearInterval(t)
  }, [authed, loadAll])

  const unlock = () => {
    if (!key.trim()) return setError('Enter admin password.')
    loadAll()
  }

  const loadPayments = useCallback(async () => {
    if (!key) return
    setPaymentsLoading(true)
    try {
      const res = await fetch('/api/admin/payments', { headers: { 'x-admin-key': key } })
      const data = await res.json()
      if (data.success) setPayments(data.payments || [])
      else flash(data.error || 'Failed to load payments')
    } catch {
      flash('Failed to load payments')
    } finally {
      setPaymentsLoading(false)
    }
  }, [key])

  const loadSubscribers = useCallback(async (query = '') => {
    if (!key) return
    setSubLoading(true)
    try {
      const res = await fetch(`/api/admin/subscribers?search=${encodeURIComponent(query)}`, { headers: { 'x-admin-key': key } })
      const data = await res.json()
      if (data.success) setSubscribers(data.subscribers || [])
      else flash(data.error || 'Failed to load subscribers')
    } catch {
      flash('Failed to load subscribers')
    } finally {
      setSubLoading(false)
    }
  }, [key])

  const loadCoupons = useCallback(async () => {
    if (!key) return
    setCouponsLoading(true)
    try {
      const res = await fetch('/api/admin/coupons', { headers: { 'x-admin-key': key } })
      const data = await res.json()
      if (data.success) setCoupons(data.coupons || [])
      else flash(data.error || 'Failed to load coupons')
    } catch {
      flash('Failed to load coupons')
    } finally {
      setCouponsLoading(false)
    }
  }, [key])

  useEffect(() => {
    if (!authed) return
    if (tab === 'payments') loadPayments()
    if (tab === 'subscribers') loadSubscribers(subSearch)
    if (tab === 'coupons') loadCoupons()
  }, [authed, tab, loadPayments, loadSubscribers, loadCoupons]) // eslint-disable-line react-hooks/exhaustive-deps

  const [justCreatedCoupon, setJustCreatedCoupon] = useState<{ code: string; days: number; maxUses: number } | null>(null)

  const createCoupon = async () => {
    const days = Number(newCouponDays)
    if (!days || days <= 0) return flash('Enter a valid number of days')
    setCreatingCoupon(true)
    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'POST', headers,
        body: JSON.stringify({ days, maxUses: Number(newCouponUses) || 1, note: newCouponNote.trim() || null }),
      })
      const data = await res.json()
      if (data.success) {
        setJustCreatedCoupon({ code: data.code, days, maxUses: Number(newCouponUses) || 1 })
        setNewCouponDays('3')
        setNewCouponUses('1')
        setNewCouponNote('')
        loadCoupons()
      } else flash(data.error || 'Failed to create coupon')
    } catch {
      flash('Failed to create coupon')
    } finally {
      setCreatingCoupon(false)
    }
  }

  const revokeCoupon = async (code: string) => {
    try {
      const res = await fetch(`/api/admin/coupons/${encodeURIComponent(code)}/revoke`, { method: 'POST', headers })
      const data = await res.json()
      if (data.success) { flash(`Revoked ${code}`); loadCoupons() }
      else flash(data.error || 'Failed to revoke')
    } catch {
      flash('Failed to revoke')
    }
  }

  const copyCoupon = (code: string) => {
    navigator.clipboard?.writeText(code)
    flash(`Copied ${code}`)
  }

  const toggleWhitelist = async (phoneNumber: string, enabled: boolean, reason = 'admin') => {
    try {
      const res = await fetch('/api/admin/subscribers/whitelist', {
        method: 'POST', headers, body: JSON.stringify({ phoneNumber, enabled, reason }),
      })
      const data = await res.json()
      if (data.success) {
        flash(enabled ? `Whitelisted ${phoneNumber}` : `Removed whitelist for ${phoneNumber}`)
        loadSubscribers(subSearch)
      } else flash(data.error || 'Failed')
    } catch {
      flash('Failed')
    }
  }

  const submitWhitelist = () => {
    const clean = whitelistPhone.replace(/[^0-9]/g, '')
    if (!clean) return flash('Enter a phone number')
    toggleWhitelist(clean, true, whitelistReason.trim() || 'admin')
    setWhitelistPhone('')
    setWhitelistReason('')
  }

  const grantPremium = async () => {
    const clean = grantPhone.replace(/[^0-9]/g, '')
    if (!clean) return flash('Enter a phone number')
    const days = Number(grantDays)
    if (!days || days <= 0) return flash('Enter a valid number of days')
    setGranting(true)
    try {
      const res = await fetch('/api/admin/premium-numbers', {
        method: 'POST', headers, body: JSON.stringify({ phone: clean, days }),
      })
      const data = await res.json()
      if (data.success) {
        flash(`Granted ${days}d Premium to ${clean}`)
        setGrantPhone('')
        setGrantDays('30')
        loadSubscribers(subSearch)
      } else flash(data.error || 'Failed to grant premium')
    } catch {
      flash('Failed to grant premium')
    } finally {
      setGranting(false)
    }
  }

  const revokePremiumNumber = async (phoneNumber: string) => {
    try {
      const res = await fetch('/api/admin/premium-numbers/revoke', {
        method: 'POST', headers, body: JSON.stringify({ phone: phoneNumber }),
      })
      const data = await res.json()
      if (data.success) { flash(`Revoked premium for ${phoneNumber}`); loadSubscribers(subSearch) }
      else flash(data.error || 'Failed to revoke')
    } catch {
      flash('Failed to revoke')
    }
  }

  const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
  const fmtMoney = (n: number, cur = 'NGN') => `${cur === 'NGN' ? '₦' : cur + ' '}${Number(n || 0).toLocaleString('en-NG')}`

  const toggle = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }
  const allSelected = bots.length > 0 && selected.size === bots.length
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(bots.map((b) => b.session_id)))

  const togglePairing = async () => {
    try {
      const res = await fetch('/api/admin/pause', {
        method: 'POST', headers, body: JSON.stringify({ paused: !pairingPaused }),
      })
      const data = await res.json()
      if (data.success) {
        setPairingPaused(data.pairingPaused)
        flash(data.pairingPaused ? 'Pairing paused' : 'Pairing resumed')
      }
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Toggle failed')
    }
  }

  const setOneStatus = async (sessionId: string, status: 'online' | 'offline') => {
    try {
      const res = await fetch(`/api/admin/bot/${encodeURIComponent(sessionId)}/status`, {
        method: 'POST', headers, body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (data.success) { flash(`Marked ${status}`); loadAll(true) } else flash(data.error || 'Failed')
    } catch (e) { flash(e instanceof Error ? e.message : 'Failed') }
  }

  const doDeleteOne = async (sessionId: string) => {
    if (!confirm(`Permanently delete ${sessionId}?`)) return
    try {
      const res = await fetch(`/api/admin/bot/${encodeURIComponent(sessionId)}`, { method: 'DELETE', headers })
      const data = await res.json()
      if (data.success) { flash('Deleted'); loadAll(true) } else flash(data.error || 'Failed')
    } catch (e) { flash(e instanceof Error ? e.message : 'Failed') }
  }

  const bulkStatus = async (status: 'online' | 'offline') => {
    const ids = Array.from(selected)
    if (!ids.length) return
    if (!confirm(`Mark ${ids.length} bot(s) ${status}?`)) return
    const res = await fetch('/api/admin/bots/status', {
      method: 'POST', headers, body: JSON.stringify({ sessionIds: ids, status }),
    })
    const data = await res.json()
    flash(data.success ? `Updated ${data.updated}` : data.error || 'Failed')
    setSelected(new Set())
    loadAll(true)
  }

  const bulkFlag = async (value: boolean) => {
    const ids = Array.from(selected)
    if (!ids.length) return
    await Promise.all(ids.map((id) =>
      fetch(`/api/admin/flag/${encodeURIComponent(id)}`, { method: 'POST', headers, body: JSON.stringify({ value }) })
    ))
    flash(`${value ? 'Flagged' : 'Unflagged'} ${ids.length} bot(s)`)
    setSelected(new Set())
    loadAll(true)
  }

  const bulkDelete = async () => {
    const ids = Array.from(selected)
    if (!ids.length) return
    if (!confirm(`Permanently delete ${ids.length} bot(s)? This cannot be undone.`)) return
    const res = await fetch('/api/admin/bots/delete', {
      method: 'POST', headers, body: JSON.stringify({ sessionIds: ids }),
    })
    const data = await res.json()
    flash(data.success ? `Deleted ${data.deleted}` : data.error || 'Failed')
    setSelected(new Set())
    loadAll(true)
  }

  const deleteAllInactive = async () => {
    const ids = bots.filter((b) => String(b.status || '').toLowerCase() !== 'online').map((b) => b.session_id)
    if (!ids.length) return flash('No inactive bots')
    if (!confirm(`Delete ALL ${ids.length} inactive bots? This cannot be undone.`)) return
    const res = await fetch('/api/admin/bots/delete', { method: 'POST', headers, body: JSON.stringify({ sessionIds: ids }) })
    const data = await res.json()
    flash(data.success ? `Deleted ${data.deleted}` : data.error || 'Failed')
    loadAll(true)
  }

  const previewVcf = async () => {
    if (!vcfFrom || !vcfTo) return flash('Pick from & to dates')
    const res = await fetch(
      `/api/admin/export-vcf-preview?from=${vcfFrom}&to=${vcfTo}&connectedOnly=${vcfOnlineOnly ? '1' : '0'}`,
      { headers: { 'x-admin-key': key } }
    )
    const data = await res.json()
    setVcfPreview(data.success ? `${data.count} contacts in range` : data.error || 'Error')
  }

  const downloadVcf = async () => {
    if (!vcfFrom || !vcfTo) return flash('Pick from & to dates')
    const res = await fetch(
      `/api/admin/export-vcf?from=${vcfFrom}&to=${vcfTo}&connectedOnly=${vcfOnlineOnly ? '1' : '0'}`,
      { headers: { 'x-admin-key': key } }
    )
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `empire-bots_${vcfFrom}_to_${vcfTo}.vcf`
    a.click()
  }

  const filteredBots = bots.filter((b) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return [b.bot_name, b.phone_number, b.session_id].join(' ').toLowerCase().includes(q)
  })

  const diskPct = stats.disk.usePercent || 0
  const ramPct = stats.ram.usePercent || 0
  const thr = stats.reserveThreshold || 90

  /* ---------- LOGIN GATE ---------- */
  if (!authed) {
    return (
      <section className="min-h-screen flex items-center justify-center px-6 relative" style={{ backgroundColor: '#EDEEF5' }}>
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.5 }}
          className="glass-card rounded-3xl p-8 md:p-10 w-full max-w-sm relative z-10 shadow-xl text-center"
        >
          <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-[#00A884]/10 flex items-center justify-center">
            <Lock className="text-[#00A884]" />
          </div>
          <h2 className="heading-md text-[#1a1a1a] mb-1">Admin <span className="text-gradient-green">Access</span></h2>
          <p className="body-text mb-6">Enter your admin password to manage the Empire network.</p>
          <input
            type="password" value={key} onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && unlock()}
            placeholder="Admin password"
            className="w-full bg-white/80 border border-black/[0.06] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] placeholder-[#8e8e8e] outline-none focus:border-[#00A884] focus:ring-2 focus:ring-[#00A884]/20 transition mb-3"
          />
          {error && <p className="text-[#e5484d] text-sm mb-3">{error}</p>}
          <motion.button whileTap={{ scale: 0.97 }} whileHover={{ y: -2 }} onClick={unlock} disabled={loading || !key}
            className="whatsapp-btn w-full py-3.5 disabled:opacity-60">
            {loading ? 'Verifying…' : 'Unlock Dashboard'}
          </motion.button>
        </motion.div>
      </section>
    )
  }

  /* ---------- DASHBOARD ---------- */
  return (
    <section className="min-h-screen overflow-x-hidden section-padding py-10 md:py-16" style={{ backgroundColor: '#EDEEF5' }}>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h2 className="heading-lg text-[#1a1a1a] flex items-center gap-2">
              <ShieldCheck className="text-[#00A884]" /> Admin <span className="text-gradient-green">Dashboard</span>
            </h2>
            <p className="body-text mt-1">
              {loading ? 'Refreshing…' : `${filteredBots.length} of ${bots.length} bots · ${selected.size} selected`}
            </p>
          </div>
          <div className="flex gap-2">
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => loadAll()}
              className="glass-card rounded-full px-4 py-2 text-sm text-[#1a1a1a] inline-flex items-center gap-2 hover:text-[#00A884] transition-colors">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
            </motion.button>
            <button
              onClick={() => { setAuthed(false); setKey(''); setBots([]); sessionStorage.removeItem('empiremd_admin_key') }}
              className="glass-card rounded-full px-4 py-2 text-sm text-[#8e8e8e] hover:text-[#1a1a1a] transition-colors"
            >
              Lock
            </button>
          </div>
        </div>

        {error && (
          <div className="text-sm text-[#e5484d] bg-[#e5484d]/10 border border-[#e5484d]/20 rounded-xl px-4 py-2.5 mb-5">
            {error}
          </div>
        )}

        {/* Tabs — horizontally scrollable so it never pushes the whole page
            sideways on narrow phone screens; scrolls within itself instead. */}
        <div className="flex gap-2 mb-5 overflow-x-auto -mx-1 px-1 pb-1" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
          {([
            { id: 'bots' as Tab, label: 'Bots', icon: BotIcon },
            { id: 'payments' as Tab, label: 'Payments', icon: CreditCard },
            { id: 'subscribers' as Tab, label: 'Subscribers', icon: Users },
            { id: 'coupons' as Tab, label: 'Coupons', icon: Ticket },
          ]).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`text-xs font-semibold px-4 py-2.5 rounded-full inline-flex items-center gap-1.5 transition-colors shrink-0 ${
                tab === id ? 'bg-[#1a1a1a] text-white' : 'glass-card text-[#8e8e8e] hover:text-[#1a1a1a]'
              }`}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        {tab === 'bots' && (
        <>
        {/* Capacity + pairing control */}
        <div className="glass-card rounded-2xl p-5 mb-5 space-y-4">
          <div className="flex flex-wrap justify-between gap-3 text-xs text-[#8e8e8e]">
            <span>Disk {diskPct}% used{stats.disk.availMB != null ? ` · ${stats.disk.availMB} MB free` : ''}</span>
            <span>
              RAM {ramPct}%{stats.ram.usedMB != null ? ` · ${stats.ram.usedMB}/${stats.ram.totalMB} MB` : ''}
            </span>
            <span>{stats.activeBots} live processes</span>
          </div>
          <div className="space-y-2">
            <div className="h-1.5 bg-black/5 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{
                width: `${Math.min(diskPct, 100)}%`,
                background: diskPct >= thr ? '#e5484d' : diskPct >= 75 ? '#FFD23F' : '#00A884',
              }} />
            </div>
            <div className="h-1.5 bg-black/5 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{
                width: `${Math.min(ramPct, 100)}%`,
                background: ramPct >= 90 ? '#e5484d' : ramPct >= 75 ? '#FFD23F' : '#00A884',
              }} />
            </div>
          </div>
          {diskPct >= thr && (
            <p className="text-xs text-[#e5484d]">⚠️ Disk near limit — consider pausing pairing.</p>
          )}
          <button
            onClick={togglePairing}
            className={`text-xs font-semibold px-4 py-2.5 rounded-full inline-flex items-center gap-2 transition-colors ${
              pairingPaused ? 'bg-[#00A884] text-white' : 'bg-[#e5484d] text-white'
            }`}
          >
            {pairingPaused ? <Play size={13} /> : <Pause size={13} />}
            {pairingPaused ? 'Resume New Pairing' : 'Pause New Pairing (Emergency)'}
          </button>
        </div>

        {/* Filter + search */}
        <div className="flex flex-wrap gap-2 items-center mb-4">
          {(['all', 'online', 'offline'] as StatusFilter[]).map((v) => (
            <button
              key={v}
              onClick={() => setStatusFilter(v)}
              className={`text-xs font-medium px-3.5 py-2 rounded-full transition-colors ${
                statusFilter === v ? 'bg-[#00A884] text-white' : 'glass-card text-[#8e8e8e] hover:text-[#1a1a1a]'
              }`}
            >
              {v === 'all' ? 'All' : v === 'online' ? 'Active' : 'Inactive'}
            </button>
          ))}
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8e8e8e]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name / number / session"
              className="w-full bg-white/80 border border-black/[0.06] rounded-full pl-9 pr-3 py-2 text-sm outline-none focus:border-[#00A884] transition"
            />
          </div>
          <button
            onClick={() => setVcfOpen(true)}
            className="text-xs font-medium glass-card px-3.5 py-2 rounded-full inline-flex items-center gap-1.5 text-[#1a1a1a] hover:text-[#00A884] transition-colors"
          >
            <Download size={13} /> Export VCF
          </button>
        </div>

        {/* Bulk action bar */}
        <AnimatePresence>
          {selected.size > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="glass-card rounded-2xl p-3 mb-5 flex flex-wrap items-center gap-2 sticky top-3 z-30"
            >
              <button onClick={toggleAll} className="text-sm text-[#1a1a1a] inline-flex items-center gap-1.5 px-2">
                {allSelected ? <CheckSquare size={16} className="text-[#00A884]" /> : <Square size={16} />} All
              </button>
              <div className="flex-1" />
              <button onClick={() => bulkStatus('online')} className="bg-[#00A884]/10 text-[#00A884] text-xs font-semibold rounded-full px-3.5 py-2">
                Mark active
              </button>
              <button onClick={() => bulkStatus('offline')} className="bg-[#FFD23F]/20 text-[#8a6d00] text-xs font-semibold rounded-full px-3.5 py-2">
                Mark inactive
              </button>
              <motion.button whileTap={{ scale: 0.95 }} onClick={() => bulkFlag(true)}
                className="bg-white/80 border border-black/[0.06] text-[#1a1a1a] text-xs font-semibold rounded-full px-3.5 py-2 inline-flex items-center gap-1.5 hover:bg-white">
                <Flag size={13} /> Flag
              </motion.button>
              <motion.button whileTap={{ scale: 0.95 }} onClick={bulkDelete}
                className="bg-[#e5484d] text-white text-xs font-semibold rounded-full px-3.5 py-2 inline-flex items-center gap-1.5">
                <Trash2 size={13} /> Delete
              </motion.button>
              <button onClick={deleteAllInactive} className="bg-[#e5484d]/10 text-[#e5484d] text-xs font-semibold rounded-full px-3.5 py-2">
                Delete all inactive
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bot grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {filteredBots.map((bot, i) => {
              const sel = selected.has(bot.session_id)
              const active = String(bot.status || '').toLowerCase() === 'online'
              return (
                <motion.div
                  key={bot.session_id}
                  layout
                  initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }} transition={{ type: 'spring', stiffness: 300, damping: 22, delay: (i % 9) * 0.03 }}
                  className={`glass-card rounded-2xl p-5 relative transition-all ${sel ? 'ring-2 ring-[#00A884]' : 'ring-1 ring-transparent'}`}
                >
                  <button
                    onClick={() => toggle(bot.session_id)}
                    className="absolute top-4 right-4"
                    aria-label={sel ? 'Deselect bot' : 'Select bot'}
                  >
                    {sel ? <CheckSquare size={18} className="text-[#00A884]" /> : <Square size={18} className="text-[#b0b0b8]" />}
                  </button>
                  {bot.is_abusive && (
                    <span className="absolute top-4 left-4 text-[10px] font-semibold text-[#e5484d] inline-flex items-center gap-1">
                      <Flag size={11} /> Flagged
                    </span>
                  )}
                  <h3 className="heading-md text-base text-[#1a1a1a] mt-4 mb-1 truncate">{bot.bot_name || 'Bot'}</h3>
                  <p className="body-text text-xs mb-2">{bot.phone_number || '—'}</p>
                  <code className="block bg-white/70 border border-black/[0.06] rounded-lg px-2 py-1.5 text-[11px] text-[#00A884] font-mono truncate">
                    {bot.session_id}
                  </code>
                  <div className="flex items-center justify-between mt-3 body-text text-xs">
                    <span className={active ? 'text-[#00A884]' : 'text-[#8e8e8e]'}>● {active ? 'active' : 'inactive'}</span>
                    {typeof bot.message_count === 'number' && <span>{bot.message_count} msgs</span>}
                  </div>
                  <div className="flex gap-1.5 mt-4 pt-3 border-t border-black/[0.06]">
                    <button
                      onClick={() => setOneStatus(bot.session_id, active ? 'offline' : 'online')}
                      className="flex-1 text-[10px] font-semibold px-2 py-1.5 rounded-lg bg-black/5 text-[#1a1a1a] hover:bg-black/10 transition-colors"
                    >
                      {active ? 'Mark inactive' : 'Mark active'}
                    </button>
                    <button
                      onClick={() => doDeleteOne(bot.session_id)}
                      className="text-[10px] font-semibold px-2.5 py-1.5 rounded-lg bg-[#e5484d]/10 text-[#e5484d] hover:bg-[#e5484d]/20 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>

        {!filteredBots.length && !loading && (
          <p className="text-center body-text py-12">No bots match.</p>
        )}
        </>
        )}

        {/* ---------- PAYMENTS TAB ---------- */}
        {tab === 'payments' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="body-text">{paymentsLoading ? 'Loading…' : `${payments.length} payment${payments.length === 1 ? '' : 's'}`}</p>
              <button onClick={loadPayments} className="glass-card rounded-full px-3.5 py-2 text-xs text-[#1a1a1a] inline-flex items-center gap-1.5 hover:text-[#00A884] transition-colors">
                <RefreshCw size={13} className={paymentsLoading ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>
            <div className="space-y-2.5">
              {payments.map((p) => (
                <div key={p.reference} className="glass-card rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-display font-semibold text-sm text-[#1a1a1a]">{fmtMoney(p.amount, p.currency)}</span>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        p.status === 'success' ? 'text-[#00A884] bg-[#00A884]/10' : 'text-[#8e8e8e] bg-black/5'
                      }`}>
                        {p.status}
                      </span>
                      {p.metadata?.months && (
                        <span className="text-[10px] font-medium text-[#8e8e8e]">{p.metadata.months} mo</span>
                      )}
                    </div>
                    <p className="text-xs text-[#8e8e8e] mt-1">
                      {p.phone_number} · {p.provider} · {fmtDate(p.paid_at)}
                    </p>
                    <p className="text-[11px] text-[#b0b0b8] font-mono truncate mt-0.5">{p.reference}</p>
                  </div>
                  {!p.session_id && (
                    <span className="text-[10px] font-medium text-[#e5484d] bg-[#e5484d]/10 px-2 py-1 rounded-full shrink-0">
                      No bot yet
                    </span>
                  )}
                </div>
              ))}
              {!payments.length && !paymentsLoading && (
                <p className="text-center body-text py-12">No payments yet.</p>
              )}
            </div>
          </div>
        )}

        {/* ---------- SUBSCRIBERS TAB ---------- */}
        {tab === 'subscribers' && (
          <div>
            <div className="glass-card rounded-2xl p-5 mb-5">
              <h3 className="heading-md text-base text-[#1a1a1a] mb-3">Whitelist a number</h3>
              <div className="flex flex-wrap gap-2">
                <input
                  value={whitelistPhone}
                  onChange={(e) => setWhitelistPhone(e.target.value)}
                  placeholder="2348012345678"
                  className="flex-1 min-w-[160px] bg-white/80 border border-black/[0.06] rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-[#00A884] transition"
                />
                <input
                  value={whitelistReason}
                  onChange={(e) => setWhitelistReason(e.target.value)}
                  placeholder="Reason (optional)"
                  className="flex-1 min-w-[140px] bg-white/80 border border-black/[0.06] rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-[#00A884] transition"
                />
                <motion.button whileTap={{ scale: 0.97 }} onClick={submitWhitelist}
                  className="whatsapp-btn px-5 py-2.5 text-sm inline-flex items-center gap-1.5">
                  <ShieldPlus size={14} /> Whitelist
                </motion.button>
              </div>
              <p className="text-[11px] text-[#8e8e8e] mt-2">Grants Premium with no expiry, independent of any session — the number stays Premium across reconnects until removed.</p>
            </div>

            <div className="glass-card rounded-2xl p-5 mb-5">
              <h3 className="heading-md text-base text-[#1a1a1a] mb-1">Grant premium (with duration)</h3>
              <p className="text-[11px] text-[#8e8e8e] mb-3">
                For a fixed number of days instead of forever — same as a coupon, but applied directly. Stacks on any remaining time.
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  value={grantPhone}
                  onChange={(e) => setGrantPhone(e.target.value)}
                  placeholder="2348012345678"
                  className="flex-1 min-w-[160px] bg-white/80 border border-black/[0.06] rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-[#00A884] transition"
                />
                <input
                  type="number" min={1}
                  value={grantDays}
                  onChange={(e) => setGrantDays(e.target.value)}
                  placeholder="Days"
                  className="w-24 bg-white/80 border border-black/[0.06] rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-[#00A884] transition"
                />
                <motion.button whileTap={{ scale: 0.97 }} onClick={grantPremium} disabled={granting}
                  className="whatsapp-btn px-5 py-2.5 text-sm inline-flex items-center gap-1.5 disabled:opacity-50">
                  <ShieldPlus size={14} /> {granting ? 'Granting…' : 'Grant'}
                </motion.button>
              </div>
            </div>

            <div className="relative mb-4">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8e8e8e]" />
              <input
                value={subSearch}
                onChange={(e) => setSubSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadSubscribers(subSearch)}
                placeholder="Search by phone number…"
                className="w-full bg-white/80 border border-black/[0.06] rounded-full pl-9 pr-3 py-2.5 text-sm outline-none focus:border-[#00A884] transition"
              />
            </div>

            <div className="space-y-2.5">
              {subscribers.map((s) => {
                const activePremium = s.is_whitelisted || (s.plan === 'premium' && s.plan_expires_at && new Date(s.plan_expires_at) > new Date())
                return (
                  <div key={s.phone_number} className="glass-card rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-display font-semibold text-sm text-[#1a1a1a]">{s.phone_number}</span>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                          activePremium ? 'text-[#1a1a1a] bg-[#9fff00]/40' : 'text-[#8e8e8e] bg-black/5'
                        }`}>
                          {activePremium ? 'Premium' : 'Free'}
                        </span>
                        {s.is_whitelisted && (
                          <span className="text-[10px] font-medium text-[#00A884] bg-[#00A884]/10 px-2 py-0.5 rounded-full">Whitelisted</span>
                        )}
                      </div>
                      <p className="text-xs text-[#8e8e8e] mt-1">
                        {s.bot_name ? `${s.bot_name} · ` : 'No bot paired · '}
                        {s.plan_expires_at ? `expires ${fmtDate(s.plan_expires_at)}` : 'no expiry'}
                        {s.status && ` · ${s.status}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!s.is_whitelisted && activePremium && (
                        <button
                          onClick={() => revokePremiumNumber(s.phone_number)}
                          className="text-[10px] font-semibold px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 bg-[#e5484d]/10 text-[#e5484d] hover:bg-[#e5484d]/20 transition-colors"
                        >
                          <Ban size={12} /> Revoke premium
                        </button>
                      )}
                      <button
                        onClick={() => toggleWhitelist(s.phone_number, !s.is_whitelisted)}
                        className={`text-[10px] font-semibold px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 transition-colors ${
                          s.is_whitelisted
                            ? 'bg-[#e5484d]/10 text-[#e5484d] hover:bg-[#e5484d]/20'
                            : 'bg-black/5 text-[#1a1a1a] hover:bg-black/10'
                        }`}
                      >
                        {s.is_whitelisted ? <ShieldMinus size={12} /> : <ShieldPlus size={12} />}
                        {s.is_whitelisted ? 'Remove whitelist' : 'Whitelist'}
                      </button>
                    </div>
                  </div>
                )
              })}
              {!subscribers.length && !subLoading && (
                <p className="text-center body-text py-12">No subscribers found.</p>
              )}
            </div>
          </div>
        )}

        {/* ---------- COUPONS TAB ---------- */}
        {tab === 'coupons' && (
          <div>
            {justCreatedCoupon && (
              <div className="rounded-2xl p-5 mb-5 border-2 border-[#00A884]/30 bg-[#00A884]/[0.06] relative">
                <button
                  onClick={() => setJustCreatedCoupon(null)}
                  className="absolute top-3 right-3 text-[#8e8e8e] hover:text-[#1a1a1a] transition-colors text-xs"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#00A884] mb-2">✅ Coupon created — copy it now</p>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-mono font-bold text-xl text-[#1a1a1a]">{justCreatedCoupon.code}</span>
                  <button
                    onClick={() => copyCoupon(justCreatedCoupon.code)}
                    className="whatsapp-btn px-4 py-2 text-xs inline-flex items-center gap-1.5"
                  >
                    <Copy size={13} /> Copy code
                  </button>
                  <span className="text-[11px] text-[#8e8e8e]">
                    {justCreatedCoupon.days} day{justCreatedCoupon.days === 1 ? '' : 's'} · max {justCreatedCoupon.maxUses} use{justCreatedCoupon.maxUses === 1 ? '' : 's'}
                  </span>
                </div>
                <p className="text-[11px] text-[#8e8e8e] mt-2">Share this in WhatsApp — users redeem it with <span className="font-mono">.free {justCreatedCoupon.code}</span></p>
              </div>
            )}

            <div className="glass-card rounded-2xl p-5 mb-5">
              <h3 className="heading-md text-base text-[#1a1a1a] mb-1">Create a coupon</h3>
              <p className="text-[11px] text-[#8e8e8e] mb-3">
                Users redeem it in WhatsApp with <span className="font-mono">.free CODE</span> — grants Premium (unlimited commands, no daily quota) for the number of days you set.
              </p>
              <div className="flex flex-wrap gap-2">
                <div className="min-w-[110px]">
                  <label className="text-[10px] text-[#8e8e8e] block mb-1">Days</label>
                  <input
                    type="number" min={1} value={newCouponDays}
                    onChange={(e) => setNewCouponDays(e.target.value)}
                    className="w-full bg-white/80 border border-black/[0.06] rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-[#00A884] transition"
                  />
                </div>
                <div className="min-w-[110px]">
                  <label className="text-[10px] text-[#8e8e8e] block mb-1">Max uses</label>
                  <input
                    type="number" min={1} value={newCouponUses}
                    onChange={(e) => setNewCouponUses(e.target.value)}
                    className="w-full bg-white/80 border border-black/[0.06] rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-[#00A884] transition"
                  />
                </div>
                <div className="flex-1 min-w-[160px]">
                  <label className="text-[10px] text-[#8e8e8e] block mb-1">Note (optional)</label>
                  <input
                    value={newCouponNote} onChange={(e) => setNewCouponNote(e.target.value)}
                    placeholder="e.g. TikTok giveaway"
                    className="w-full bg-white/80 border border-black/[0.06] rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-[#00A884] transition"
                  />
                </div>
                <div className="flex items-end">
                  <motion.button whileTap={{ scale: 0.97 }} onClick={createCoupon} disabled={creatingCoupon}
                    className="whatsapp-btn px-5 py-2.5 text-sm inline-flex items-center gap-1.5 disabled:opacity-50">
                    <Ticket size={14} /> {creatingCoupon ? 'Creating…' : 'Generate'}
                  </motion.button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mb-4">
              <p className="body-text">{couponsLoading ? 'Loading…' : `${coupons.length} coupon${coupons.length === 1 ? '' : 's'}`}</p>
              <button onClick={loadCoupons} className="glass-card rounded-full px-3.5 py-2 text-xs text-[#1a1a1a] inline-flex items-center gap-1.5 hover:text-[#00A884] transition-colors">
                <RefreshCw size={13} className={couponsLoading ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>
            <div className="space-y-2.5">
              {coupons.map((c) => (
                <div key={c.code} className="glass-card rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={() => copyCoupon(c.code)} className="font-mono font-semibold text-sm text-[#1a1a1a] inline-flex items-center gap-1 hover:text-[#00A884] transition-colors">
                        {c.code} <Copy size={11} />
                      </button>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        c.active ? 'text-[#00A884] bg-[#00A884]/10' : 'text-[#8e8e8e] bg-black/5'
                      }`}>
                        {c.active ? 'active' : 'revoked'}
                      </span>
                      <span className="text-[10px] font-medium text-[#8e8e8e]">
                        {c.uses_count}/{c.max_uses} used · {c.days} day{c.days === 1 ? '' : 's'}
                      </span>
                    </div>
                    {c.note && <p className="text-xs text-[#8e8e8e] mt-1">{c.note}</p>}
                    <p className="text-[11px] text-[#b0b0b8] mt-0.5">Created {fmtDate(c.created_at)}</p>
                  </div>
                  {c.active && (
                    <button onClick={() => revokeCoupon(c.code)}
                      className="text-[10px] font-semibold px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 shrink-0 bg-[#e5484d]/10 text-[#e5484d] hover:bg-[#e5484d]/20 transition-colors">
                      <Ban size={12} /> Revoke
                    </button>
                  )}
                </div>
              ))}
              {!coupons.length && !couponsLoading && (
                <p className="text-center body-text py-12">No coupons yet.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* VCF export modal */}
      <AnimatePresence>
        {vcfOpen && tab === 'bots' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-[#EDEEF5]/70 backdrop-blur-sm" onClick={() => setVcfOpen(false)} />
            <motion.div
              initial={{ scale: 0.94, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.94, opacity: 0 }}
              className="glass-card relative z-10 w-full max-w-md rounded-3xl p-7 shadow-2xl"
            >
              <h3 className="heading-md text-[#1a1a1a] mb-1">Export <span className="text-gradient-green">contacts</span></h3>
              <p className="body-text mb-4">Bots created in this window, as a VCF you can import on the master phone.</p>
              <div className="flex flex-wrap gap-3 mb-4">
                <label className="text-xs text-[#8e8e8e] flex-1 min-w-[120px]">
                  From
                  <input type="date" value={vcfFrom} onChange={(e) => setVcfFrom(e.target.value)}
                    className="block w-full mt-1 bg-white/80 border border-black/[0.06] rounded-lg px-2.5 py-2 text-sm text-[#1a1a1a] outline-none focus:border-[#00A884]" />
                </label>
                <label className="text-xs text-[#8e8e8e] flex-1 min-w-[120px]">
                  To
                  <input type="date" value={vcfTo} onChange={(e) => setVcfTo(e.target.value)}
                    className="block w-full mt-1 bg-white/80 border border-black/[0.06] rounded-lg px-2.5 py-2 text-sm text-[#1a1a1a] outline-none focus:border-[#00A884]" />
                </label>
              </div>
              <label className="text-xs text-[#8e8e8e] flex items-center gap-2 mb-5">
                <input type="checkbox" checked={vcfOnlineOnly} onChange={(e) => setVcfOnlineOnly(e.target.checked)} />
                Online only
              </label>
              {vcfPreview && <p className="text-xs text-[#00A884] mb-4">{vcfPreview}</p>}
              <div className="flex gap-3">
                <button onClick={previewVcf} className="flex-1 bg-white/80 border border-black/[0.06] rounded-full py-3 text-sm font-semibold text-[#1a1a1a] hover:bg-white transition">
                  Preview
                </button>
                <motion.button whileTap={{ scale: 0.97 }} onClick={downloadVcf} className="flex-1 whatsapp-btn py-3">
                  Download
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[110] glass-card glow-green rounded-full px-5 py-3 text-sm font-medium text-[#1a1a1a]">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
