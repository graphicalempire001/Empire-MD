import React, { useState, useEffect, useCallback } from 'react';

/**
 * Empire MD Admin Dashboard (React)
 * Route: /admin  — imported from App.tsx as AdminDashboard
 */
export default function AdminDashboard() {
  const [bots, setBots] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | online | offline
  const [pairingPaused, setPairingPaused] = useState(false);
  const [systemStats, setSystemStats] = useState({
    activeBots: 0,
    disk: { usePercent: 0, availMB: 0, totalMB: 0 },
    ram: { usePercent: 0, freeMB: 0, usedMB: 0, totalMB: 0 },
    reserveThreshold: 90
  });
  const [adminKey, setAdminKey] = useState(
    () => localStorage.getItem('admin_key') || localStorage.getItem('adminKey') || ''
  );
  const [keyInput, setKeyInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [vcfFrom, setVcfFrom] = useState('');
  const [vcfTo, setVcfTo] = useState('');
  const [vcfOnlineOnly, setVcfOnlineOnly] = useState(false);
  const [vcfPreview, setVcfPreview] = useState('');
  const [toast, setToast] = useState('');

  const headers = {
    'Content-Type': 'application/json',
    'x-admin-key': adminKey
  };

  const flash = (m) => {
    setToast(m);
    setTimeout(() => setToast(''), 2800);
  };

  const fetchAdminData = useCallback(async () => {
    if (!adminKey) return;
    setLoading(true);
    setError('');
    try {
      const statusRes = await fetch(`/api/admin/status?adminKey=${encodeURIComponent(adminKey)}`, {
        headers: { 'x-admin-key': adminKey }
      });
      if (statusRes.status === 403) throw new Error('Forbidden: Invalid Admin Key');
      const statusData = await statusRes.json();
      if (statusData.success) {
        setSystemStats({
          activeBots: statusData.activeBots || 0,
          disk: statusData.disk || { usePercent: 0, availMB: 0 },
          ram: statusData.ram || { usePercent: 0, freeMB: 0, usedMB: 0, totalMB: 0 },
          reserveThreshold: statusData.reserveThreshold || 90
        });
        setPairingPaused(!!statusData.pairingPaused);
      }

      let botsUrl = '/api/admin/bots';
      if (statusFilter === 'online') botsUrl += '?status=online';
      if (statusFilter === 'offline') botsUrl += '?status=offline';

      const botsRes = await fetch(botsUrl, { headers: { 'x-admin-key': adminKey } });
      if (botsRes.status === 403) throw new Error('Forbidden: Invalid Admin Key');
      const botsData = await botsRes.json();
      if (botsData.success) setBots(botsData.bots || []);
      else setError(botsData.error || 'Failed to load bots');
    } catch (err) {
      setError(err.message || 'Failed to load admin data');
      if (String(err.message || '').includes('Forbidden')) {
        setAdminKey('');
        localStorage.removeItem('admin_key');
        localStorage.removeItem('adminKey');
      }
    } finally {
      setLoading(false);
    }
  }, [adminKey, statusFilter]);

  useEffect(() => {
    if (!adminKey) return;
    localStorage.setItem('admin_key', adminKey);
    localStorage.setItem('adminKey', adminKey);
    fetchAdminData();
    const t = setInterval(fetchAdminData, 15000);
    return () => clearInterval(t);
  }, [adminKey, fetchAdminData]);

  useEffect(() => {
    const to = new Date();
    const from = new Date(Date.now() - 7 * 864e5);
    const iso = (d) => d.toISOString().slice(0, 10);
    setVcfTo(iso(to));
    setVcfFrom(iso(from));
  }, []);

  const unlock = () => {
    const k = keyInput.trim();
    if (!k) return setError('Enter admin key');
    setAdminKey(k);
  };

  const togglePairing = async () => {
    try {
      const res = await fetch('/api/admin/pause', {
        method: 'POST',
        headers,
        body: JSON.stringify({ paused: !pairingPaused })
      });
      const data = await res.json();
      if (data.success) {
        setPairingPaused(data.pairingPaused);
        flash(data.pairingPaused ? 'Pairing paused' : 'Pairing resumed');
      }
    } catch (err) {
      flash('Toggle failed: ' + err.message);
    }
  };

  const setBotStatus = async (sessionId, status) => {
    try {
      const res = await fetch(`/api/admin/bot/${encodeURIComponent(sessionId)}/status`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (data.success) {
        flash(`Marked ${status}`);
        fetchAdminData();
      } else flash(data.error || 'Failed');
    } catch (e) {
      flash(e.message);
    }
  };

  const deleteBot = async (sessionId) => {
    if (!confirm(`Permanently delete ${sessionId} from DB + sessions?`)) return;
    try {
      const res = await fetch(`/api/admin/bot/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
        headers
      });
      const data = await res.json();
      if (data.success) {
        flash('Deleted');
        fetchAdminData();
      } else flash(data.error || 'Failed');
    } catch (e) {
      flash(e.message);
    }
  };

  const selectedIds = () => Array.from(selected);

  const bulkStatus = async (status) => {
    const sessionIds = selectedIds();
    if (!sessionIds.length) return;
    if (!confirm(`${status} ${sessionIds.length} bots?`)) return;
    const res = await fetch('/api/admin/bots/status', {
      method: 'POST',
      headers,
      body: JSON.stringify({ sessionIds, status })
    });
    const data = await res.json();
    flash(data.success ? `Updated ${data.updated}` : data.error || 'Fail');
    setSelected(new Set());
    fetchAdminData();
  };

  const bulkDelete = async () => {
    const sessionIds = selectedIds();
    if (!sessionIds.length) return;
    if (!confirm(`DELETE ${sessionIds.length} bots from Supabase + disk?`)) return;
    const res = await fetch('/api/admin/bots/delete', {
      method: 'POST',
      headers,
      body: JSON.stringify({ sessionIds })
    });
    const data = await res.json();
    flash(data.success ? `Deleted ${data.deleted}` : data.error || 'Fail');
    setSelected(new Set());
    fetchAdminData();
  };

  const deleteAllInactive = async () => {
    const ids = bots
      .filter((b) => String(b.status || '').toLowerCase() !== 'online')
      .map((b) => b.session_id)
      .filter(Boolean);
    if (!ids.length) return flash('No inactive bots');
    if (!confirm(`Delete ALL ${ids.length} inactive bots?`)) return;
    const res = await fetch('/api/admin/bots/delete', {
      method: 'POST',
      headers,
      body: JSON.stringify({ sessionIds: ids })
    });
    const data = await res.json();
    flash(data.success ? `Deleted ${data.deleted}` : data.error || 'Fail');
    fetchAdminData();
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const filteredBots = bots.filter((b) => {
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    return [b.bot_name, b.phone_number, b.session_id].join(' ').toLowerCase().includes(q);
  });

  const previewVcf = async () => {
    if (!vcfFrom || !vcfTo) return flash('Pick from & to dates');
    const res = await fetch(
      `/api/admin/export-vcf-preview?from=${vcfFrom}&to=${vcfTo}&connectedOnly=${vcfOnlineOnly ? '1' : '0'}`,
      { headers: { 'x-admin-key': adminKey } }
    );
    const data = await res.json();
    setVcfPreview(data.success ? `${data.count} contacts in range` : data.error || 'error');
  };

  const downloadVcf = async () => {
    if (!vcfFrom || !vcfTo) return flash('Pick from & to dates');
    const res = await fetch(
      `/api/admin/export-vcf?from=${vcfFrom}&to=${vcfTo}&connectedOnly=${vcfOnlineOnly ? '1' : '0'}`,
      { headers: { 'x-admin-key': adminKey } }
    );
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `empire-bots_${vcfFrom}_to_${vcfTo}.vcf`;
    a.click();
  };

  const diskPct = systemStats.disk?.usePercent || 0;
  const ramPct = systemStats.ram?.usePercent || 0;
  const thr = systemStats.reserveThreshold || 90;

  // ── Login gate ──
  if (!adminKey) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h1 className="text-xl font-bold text-white">Empire Admin</h1>
          <p className="text-xs text-slate-500">Enter ADMIN_KEY</p>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && unlock()}
            placeholder="Admin key"
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-rose-500"
          />
          <button
            type="button"
            onClick={unlock}
            className="w-full bg-rose-600 hover:bg-rose-500 rounded-xl py-3 text-sm font-bold"
          >
            Enter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-white">Empire Admin</h1>
            <p className="text-xs text-slate-500">
              {loading ? 'Refreshing…' : `${filteredBots.length} bots shown · ${bots.length} loaded`}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={fetchAdminData}
              className="text-xs px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => {
                setAdminKey('');
                localStorage.removeItem('admin_key');
                localStorage.removeItem('adminKey');
              }}
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-slate-400"
            >
              Lock
            </button>
          </div>
        </header>

        {error && (
          <div className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-2">
            {error}
          </div>
        )}

        {/* Capacity: disk + RAM */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-400">
            <span>
              Disk {diskPct}% used · {systemStats.disk?.availMB ?? '—'} MB free
            </span>
            <span>
              RAM {ramPct}% · {systemStats.ram?.usedMB ?? '—'}/{systemStats.ram?.totalMB ?? '—'} MB
              (free {systemStats.ram?.freeMB ?? '—'} MB)
            </span>
            <span>{systemStats.activeBots} live processes</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(diskPct, 100)}%`,
                background: diskPct >= thr ? '#ef4444' : diskPct >= 75 ? '#f59e0b' : '#22c55e'
              }}
            />
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(ramPct, 100)}%`,
                background: ramPct >= 90 ? '#ef4444' : ramPct >= 75 ? '#f59e0b' : '#38bdf8'
              }}
            />
          </div>
          {diskPct >= thr && (
            <p className="text-xs text-rose-400">⚠️ Disk near limit — consider pausing pairing.</p>
          )}
          <button
            type="button"
            onClick={togglePairing}
            className={`text-xs px-4 py-2 rounded-lg font-bold ${
              pairingPaused ? 'bg-emerald-600' : 'bg-rose-600'
            }`}
          >
            {pairingPaused ? 'Resume New Pairing' : 'Pause New Pairing (Emergency)'}
          </button>
          <p className="text-[11px] text-slate-500">
            {pairingPaused
              ? 'Status: PAUSED — new pairing blocked'
              : 'Status: active — accepting new bots'}
          </p>
        </section>

        {/* VCF export */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <h2 className="font-bold text-sm text-white">Export bot numbers → VCF</h2>
          <p className="text-[11px] text-slate-500">
            Date range = bots created in window. Import on master phone. Names: Empire Bot – {'{name}'}
          </p>
          <div className="flex flex-wrap gap-2 items-end">
            <label className="text-[11px] text-slate-400">
              From
              <input
                type="date"
                value={vcfFrom}
                onChange={(e) => setVcfFrom(e.target.value)}
                className="block bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-[11px] text-slate-400">
              To
              <input
                type="date"
                value={vcfTo}
                onChange={(e) => setVcfTo(e.target.value)}
                className="block bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-[11px] flex items-center gap-1 pb-2 text-slate-400">
              <input
                type="checkbox"
                checked={vcfOnlineOnly}
                onChange={(e) => setVcfOnlineOnly(e.target.checked)}
              />{' '}
              Online only
            </label>
            <button
              type="button"
              onClick={previewVcf}
              className="text-[11px] px-3 py-2 rounded-lg bg-slate-800 border border-slate-700"
            >
              Preview
            </button>
            <button
              type="button"
              onClick={downloadVcf}
              className="text-[11px] px-3 py-2 rounded-lg bg-emerald-700/80 font-bold"
            >
              Download VCF
            </button>
            <span className="text-[11px] text-slate-400">{vcfPreview}</span>
          </div>
        </section>

        {/* Filters + bulk */}
        <section className="flex flex-wrap gap-2 items-center">
          {['all', 'online', 'offline'].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setStatusFilter(v)}
              className={`text-xs px-3 py-2 rounded-lg ${
                statusFilter === v ? 'bg-rose-500/20 text-rose-300' : 'bg-slate-800'
              }`}
            >
              {v === 'all' ? 'All' : v === 'online' ? 'Active' : 'Inactive'}
            </button>
          ))}
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name / number / session"
            className="flex-1 min-w-[160px] bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm"
          />
        </section>

        {selected.size > 0 && (
          <section className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-wrap gap-2 items-center">
            <span className="text-xs text-slate-400">{selected.size} selected</span>
            <button
              type="button"
              onClick={() => bulkStatus('online')}
              className="text-xs px-3 py-1.5 rounded-lg bg-emerald-700/50"
            >
              Mark active
            </button>
            <button
              type="button"
              onClick={() => bulkStatus('offline')}
              className="text-xs px-3 py-1.5 rounded-lg bg-amber-700/50"
            >
              Mark inactive
            </button>
            <button
              type="button"
              onClick={bulkDelete}
              className="text-xs px-3 py-1.5 rounded-lg bg-rose-700/60 font-bold"
            >
              Delete selected
            </button>
            <button
              type="button"
              onClick={deleteAllInactive}
              className="text-xs px-3 py-1.5 rounded-lg bg-rose-900/80 border border-rose-700"
            >
              Delete all inactive
            </button>
          </section>
        )}

        <div className="overflow-x-auto border border-slate-800 rounded-2xl">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-left text-xs text-slate-500">
              <tr>
                <th className="p-3" />
                <th className="p-3">Bot</th>
                <th className="p-3">Phone</th>
                <th className="p-3">Status</th>
                <th className="p-3">Created</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBots.map((b) => {
                const sid = b.session_id || '';
                const active = String(b.status || '').toLowerCase() === 'online';
                return (
                  <tr key={sid} className="border-t border-slate-800/80 hover:bg-slate-900/50">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selected.has(sid)}
                        onChange={() => toggleSelect(sid)}
                      />
                    </td>
                    <td className="p-3">
                      <div className="font-medium text-slate-100">{b.bot_name || 'Bot'}</div>
                      <div className="text-[10px] text-slate-600 font-mono">{sid}</div>
                    </td>
                    <td className="p-3 font-mono text-xs">{b.phone_number || '—'}</td>
                    <td className="p-3">
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full ${
                          active
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-slate-700 text-slate-400'
                        }`}
                      >
                        {active ? 'active' : 'inactive'}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-slate-500">
                      {b.created_at ? new Date(b.created_at).toLocaleString() : '—'}
                    </td>
                    <td className="p-3 space-x-1 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setBotStatus(sid, 'online')}
                        className="text-[10px] px-2 py-1 rounded bg-emerald-900/40"
                      >
                        Active
                      </button>
                      <button
                        type="button"
                        onClick={() => setBotStatus(sid, 'offline')}
                        className="text-[10px] px-2 py-1 rounded bg-amber-900/40"
                      >
                        Inactive
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteBot(sid)}
                        className="text-[10px] px-2 py-1 rounded bg-rose-900/50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!filteredBots.length && (
            <p className="text-center text-slate-500 text-sm py-8">No bots match.</p>
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-800 border border-slate-700 rounded-full px-5 py-2 text-sm">
          {toast}
        </div>
      )}
    </div>
  );
}
