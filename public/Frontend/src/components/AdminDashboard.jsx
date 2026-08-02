import React, { useState, useEffect } from 'react';

export default function AdminDashboard() {
  const [bots, setBots] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name'); // 'name' | 'number' | 'status'
  const [pairingPaused, setPairingPaused] = useState(false);
  const [systemStats, setSystemStats] = useState({ activeBots: 0, disk: { usePercent: 0, availMB: 0 }, reserveThreshold: 90 });
  const [adminKey, setAdminKey] = useState(localStorage.getItem('admin_key') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch full status and bot list from backend
  const fetchAdminData = async () => {
    if (!adminKey) return;
    setLoading(true);
    setError('');
    try {
      // 1. Fetch system config & status
      const statusRes = await fetch(`/api/admin/status?adminKey=${adminKey}`);
      if (statusRes.status === 403) throw new Error("Forbidden: Invalid Admin Key");
      const statusData = await statusRes.json();
      if (statusData.success) {
        setSystemStats({
          activeBots: statusData.activeBots,
          disk: statusData.disk,
          reserveThreshold: statusData.reserveThreshold
        });
        setPairingPaused(statusData.pairingPaused);
      }

      // 2. Fetch full registered bots list
      const botsRes = await fetch(`/api/admin/bots?adminKey=${adminKey}`);
      const botsData = await botsRes.json();
      if (botsData.success) {
        setBots(botsData.bots);
      }
    } catch (err) {
      setError(err.message || "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (adminKey) {
      localStorage.setItem('admin_key', adminKey);
      fetchAdminData();
    }
  }, [adminKey]);

  // Handle emergency pairing toggle
  const togglePairing = async () => {
    const targetState = !pairingPaused;
    try {
      const res = await fetch('/api/admin/pause', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey
        },
        body: JSON.stringify({ paused: targetState })
      });
      const data = await res.json();
      if (data.success) {
        setPairingPaused(data.pairingPaused);
      }
    } catch (err) {
      alert("Failed to toggle pairing: " + err.message);
    }
  };

  // Terminate a single bot session safely (kills worker process + removes files)
  const handleDeleteBot = async (sessionId) => {
    if (!window.confirm(`Are you sure you want to completely DELETE and disconnect bot session ${sessionId}?`)) return;
    try {
      const res = await fetch(`/api/admin/bot/${sessionId}`, {
        method: 'DELETE',
        headers: { 'x-admin-key': adminKey }
      });
      const data = await res.json();
      if (data.success) {
        setBots(bots.filter(b => b.session_id !== sessionId));
        setSystemStats(prev => ({ ...prev, activeBots: Math.max(0, prev.activeBots - 1) }));
      }
    } catch (err) {
      alert("Failed to delete bot: " + err.message);
    }
  };

  // Flag/unflag bot as abusive
  const handleToggleAbusive = async (sessionId, currentAbusive) => {
    try {
      const res = await fetch(`/api/admin/flag/${sessionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey
        },
        body: JSON.stringify({ value: !currentAbusive })
      });
      const data = await res.json();
      if (data.success) {
        setBots(bots.map(b => b.session_id === sessionId ? { ...b, is_abusive: !currentAbusive } : b));
      }
    } catch (err) {
      alert("Failed to flag bot: " + err.message);
    }
  };

  // Filter and Sort Logic
  const filteredAndSortedBots = bots
    .filter(bot => {
      const query = searchQuery.toLowerCase().trim();
      const botName = (bot.bot_name || '').toLowerCase();
      const phoneNumber = (bot.phone_number || '').toLowerCase();
      return botName.includes(query) || phoneNumber.includes(query);
    })
    .sort((a, b) => {
      if (sortBy === 'name') {
        return (a.bot_name || '').localeCompare(b.bot_name || '');
      }
      if (sortBy === 'number') {
        return (a.phone_number || '').localeCompare(b.phone_number || '');
      }
      if (sortBy === 'status') {
        return (a.status || '').localeCompare(b.status || '');
      }
      return 0;
    });

  return (
    <div style={styles.container}>
      {/* 1. Admin Authentication Barrier */}
      {!adminKey ? (
        <div style={styles.authCard}>
          <h2 style={styles.authTitle}>🔐 Empire MD - Admin Access Only</h2>
          <p style={styles.authSubtitle}>Please input your ADMIN_KEY from your .env file to gain access.</p>
          <input
            type="password"
            placeholder="Enter Admin Key..."
            style={styles.input}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setAdminKey(e.target.value);
            }}
          />
        </div>
      ) : (
        <>
          {/* Header & Controls */}
          <div style={styles.header}>
            <div>
              <h1 style={styles.title}>👑 Admin Terminal</h1>
              <p style={styles.subtitle}>Complete process isolation monitoring & control dashboard</p>
            </div>
            <button onClick={fetchAdminData} style={styles.refreshBtn} disabled={loading}>
              {loading ? 'Refreshing...' : '🔄 Refresh Live Data'}
            </button>
          </div>

          {error && <div style={styles.errorAlert}>❌ {error}</div>}

          {/* System Health / VPS Analytics */}
          <div style={styles.metricsGrid}>
            <div style={styles.metricCard}>
              <span style={styles.metricLabel}>Isolated Instances running</span>
              <span style={styles.metricValue}>{systemStats.activeBots} / Safe Max (15)</span>
            </div>
            <div style={styles.metricCard}>
              <span style={styles.metricLabel}>VPS Storage Use</span>
              <span style={styles.metricValue}>{systemStats.disk.usePercent}%</span>
              <div style={styles.progressBarBg}>
                <div style={{...styles.progressBar, width: `${systemStats.disk.usePercent}%`, background: systemStats.disk.usePercent > 80 ? '#E65C53' : '#F3A04C'}} />
              </div>
            </div>
            <div style={styles.metricCard}>
              <span style={styles.metricLabel}>Emergency Pairing Status</span>
              <button
                onClick={togglePairing}
                style={{
                  ...styles.toggleBtn,
                  background: pairingPaused ? '#E65C53' : '#40B43E'
                }}
              >
                {pairingPaused ? '🛑 PAIRED PAUSED (EMERGENCY)' : '🟢 PAIRING ENABLED (NORMAL)'}
              </button>
            </div>
          </div>

          {/* Filter Toolbar */}
          <div style={styles.toolbar}>
            <input
              type="text"
              placeholder="🔍 Search bots by name or phone number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={styles.searchBar}
            />
            <div style={styles.sortControls}>
              <span style={styles.sortLabel}>Sort By:</span>
              <button onClick={() => setSortBy('name')} style={{...styles.sortBtn, ...(sortBy === 'name' ? styles.activeSortBtn : {})}}>Name</button>
              <button onClick={() => setSortBy('number')} style={{...styles.sortBtn, ...(sortBy === 'number' ? styles.activeSortBtn : {})}}>Number</button>
              <button onClick={() => setSortBy('status')} style={{...styles.sortBtn, ...(sortBy === 'status' ? styles.activeSortBtn : {})}}>Status</button>
            </div>
          </div>

          {/* Lined Up Bots List */}
          <div style={styles.listContainer}>
            {filteredAndSortedBots.length === 0 ? (
              <div style={styles.emptyState}>No bot processes match your current filter.</div>
            ) : (
              filteredAndSortedBots.map((bot) => (
                <div key={bot.session_id} style={styles.botRow}>
                  <div style={styles.botInfo}>
                    <span style={styles.botName}>🤖 {bot.bot_name || 'Unnamed Bot'}</span>
                    <span style={styles.botPhone}>📱 +{bot.phone_number || 'No Number Linked'}</span>
                    <span style={styles.sessionId}>Session ID: <code>{bot.session_id}</code></span>
                  </div>

                  <div style={styles.botStats}>
                    <span style={{
                      ...styles.statusBadge,
                      background: bot.status === 'connected' ? 'rgba(64, 180, 62, 0.15)' : 'rgba(230, 92, 83, 0.15)',
                      color: bot.status === 'connected' ? '#40B43E' : '#E65C53'
                    }}>
                      {bot.status?.toUpperCase() || 'OFFLINE'}
                    </span>
                    <span style={styles.usageText}>Total Messages Sent: <strong>{bot.usage_count || 0}</strong></span>
                  </div>

                  <div style={styles.botActions}>
                    <button
                      onClick={() => handleToggleAbusive(bot.session_id, bot.is_abusive)}
                      style={{
                        ...styles.actionBtn,
                        background: bot.is_abusive ? '#EBA400' : 'rgba(0,0,0,0.05)',
                        color: bot.is_abusive ? '#000' : '#454545'
                      }}
                    >
                      ⚠️ {bot.is_abusive ? 'Abuse Blocked' : 'Flag Abuse'}
                    </button>
                    <button
                      onClick={() => handleDeleteBot(bot.session_id)}
                      style={{...styles.actionBtn, background: '#E65C53', color: '#fff'}}
                    >
                      🛑 Terminate Process
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  container: { padding: '24px', fontFamily: 'ui-sans-serif, system-ui, sans-serif', maxWidth: '1000px', margin: '0 auto', color: '#333' },
  authCard: { background: '#fff', padding: '32px', borderRadius: '14px', border: '1px solid #ddd', textAlign: 'center', marginTop: '100px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' },
  authTitle: { fontSize: '20px', fontWeight: '600', marginBottom: '8px' },
  authSubtitle: { fontSize: '14px', color: '#666', marginBottom: '24px' },
  input: { width: '100%', maxWidth: '360px', height: '40px', borderRadius: '10px', border: '1px solid #ccc', padding: '0 16px', fontSize: '14px', textAlign: 'center', outline: 'none' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
  title: { fontSize: '24px', fontWeight: '600', margin: 0 },
  subtitle: { fontSize: '14px', color: '#666', margin: '4px 0 0 0' },
  refreshBtn: { height: '36px', padding: '0 16px', border: '1px solid #ddd', borderRadius: '8px', background: '#fff', fontSize: '13px', cursor: 'pointer', fontWeight: '500' },
  errorAlert: { background: 'rgba(230, 92, 83, 0.1)', color: '#E65C53', padding: '12px 16px', borderRadius: '10px', marginBottom: '20px', fontSize: '14px', border: '1px solid rgba(230,92,83,0.2)' },
  metricsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' },
  metricCard: { background: '#fff', border: '1px solid #eee', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' },
  metricLabel: { fontSize: '12px', color: '#666', fontWeight: '500' },
  metricValue: { fontSize: '20px', fontWeight: '600' },
  progressBarBg: { height: '6px', background: '#eee', borderRadius: '3px', overflow: 'hidden' },
  progressBar: { height: '100%', borderRadius: '3px', transition: 'width 0.3s ease' },
  toggleBtn: { border: 0, borderRadius: '8px', height: '36px', color: '#fff', fontWeight: '600', fontSize: '12px', cursor: 'pointer', outline: 'none' },
  toolbar: { display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '20px', alignItems: 'center', justifyContent: 'space-between' },
  searchBar: { flex: 1, minWidth: '280px', height: '40px', borderRadius: '10px', border: '1px solid #ddd', padding: '0 16px', fontSize: '14px', outline: 'none' },
  sortControls: { display: 'flex', gap: '8px', alignItems: 'center' },
  sortLabel: { fontSize: '13px', color: '#666', fontWeight: '500' },
  sortBtn: { height: '32px', padding: '0 12px', border: '1px solid #ddd', borderRadius: '6px', background: '#fff', fontSize: '12px', cursor: 'pointer' },
  activeSortBtn: { background: '#F3A04C', color: '#fff', borderColor: '#F3A04C', fontWeight: '500' },
  listContainer: { display: 'flex', flexDirection: 'column', gap: '12px' },
  emptyState: { padding: '40px', textAlign: 'center', color: '#888', background: '#fafafa', borderRadius: '12px', border: '1px dashed #ddd' },
  botRow: { background: '#fff', border: '1px solid #eee', borderRadius: '12px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' },
  botInfo: { display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '200px' },
  botName: { fontSize: '15px', fontWeight: '600' },
  botPhone: { fontSize: '13px', color: '#555' },
  sessionId: { fontSize: '11px', color: '#888' },
  botStats: { display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '150px' },
  statusBadge: { padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', alignSelf: 'flex-start' },
  usageText: { fontSize: '12px', color: '#666' },
  botActions: { display: 'flex', gap: '8px' },
  actionBtn: { height: '32px', padding: '0 12px', border: 0, borderRadius: '8px', fontSize: '12px', fontWeight: '500', cursor: 'pointer' }
};
