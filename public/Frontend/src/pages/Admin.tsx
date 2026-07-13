import { useEffect, useState, useCallback } from 'react';
import { ShieldCheck, HardDrive, Power, Flag, Trash2, RefreshCw, LogOut, AlertTriangle } from 'lucide-react';

interface AdminBot {
  session_id: string;
  bot_name: string;
  phone_number: string;
  status: string;
  message_count: number;
  is_abusive: boolean;
}

const KEY_STORE = 'empire_admin_key';

export default function Admin() {
  const [key, setKey] = useState<string>(localStorage.getItem(KEY_STORE) || '');
  const [authed, setAuthed] = useState(false);
  const [input, setInput] = useState('');
  const [err, setErr] = useState('');
  const [bots, setBots] = useState<AdminBot[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const headers = useCallback(() => ({ 'Content-Type': 'application/json', 'x-admin-key': key }), [key]);

  const loadAll = useCallback(async () => {
    if (!key) return;
    setLoading(true);
    try {
      const [sRes, uRes] = await Promise.all([
        fetch('/api/admin/status', { headers: headers() }),
        fetch('/api/admin/usage?limit=100', { headers: headers() }),
      ]);
      if (sRes.status === 403 || uRes.status === 403) {
        setAuthed(false); setErr('Invalid admin key.'); localStorage.removeItem(KEY_STORE);
        setLoading(false); return;
      }
      const sData = await sRes.json();
      const uData = await uRes.json();
      setStatus(sData);
      if (uData.success) setBots(uData.bots || []);
      setAuthed(true);
    } catch { setErr('Server unreachable.'); }
    setLoading(false);
  }, [key, headers]);

  useEffect(() => { if (key) loadAll(); }, [key, loadAll]);

  const submitKey = () => {
    if (!input.trim()) return;
    setKey(input.trim());
    localStorage.setItem(KEY_STORE, input.trim());
  };

  const logout = () => { setKey(''); setAuthed(false); localStorage.removeItem(KEY_STORE); };

  const togglePause = async () => {
    await fetch('/api/admin/pause', {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ paused: !status?.pairingPaused }),
    });
    loadAll();
  };

  const flagBot = async (id: string, value: boolean) => {
    await fetch(`/api/admin/flag/${id}`, { method: 'POST', headers: headers(), body: JSON.stringify({ value }) });
    loadAll();
  };

  const deleteBot = async (id: string) => {
    if (!confirm('Permanently delete this bot?')) return;
    await fetch(`/api/admin/bot/${id}`, { method: 'DELETE', headers: headers() });
    loadAll();
  };

  // ─── Auth gate ───
  if (!authed) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-slate-900/70 border border-slate-800 rounded-3xl p-8 backdrop-blur-xl">
          <ShieldCheck className="text-emerald-400 w-12 h-12 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white text-center mb-1">Owner Access Only</h1>
          <p className="text-slate-400 text-sm text-center mb-6">Enter the admin key to manage the bot registry.</p>
          <input
            type="password" value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitKey()}
            placeholder="Admin key"
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500 mb-3"
          />
          {err && <p className="text-red-400 text-xs mb-3 flex items-center gap-1"><AlertTriangle size={13} /> {err}</p>}
          <button onClick={submitKey} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl">Unlock Dashboard</button>
        </div>
      </div>
    );
  }

  // ─── Dashboard ───
  const disk = status?.disk;
  return (
    <div className="min-h-screen bg-slate-950 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-white">Empire Admin</h1>
            <p className="text-slate-500 text-sm">Registry control · {status?.activeBots ?? 0} active</p>
          </div>
          <div className="flex gap-2">
            <button onClick={loadAll} className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 hover:text-white">
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={logout} className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 hover:text-red-400">
              <LogOut size={18} />
            </button>
          </div>
        </div>

        {/* Capacity panel */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-2"><HardDrive size={16} /> Disk Usage</div>
            <p className="text-2xl font-bold text-white">{disk ? `${disk.usePercent}%` : '—'}</p>
            <p className="text-xs text-slate-500">{disk ? `${disk.availMB} MB free` : ''}</p>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-2"><Bot16 /> Active Bots</div>
            <p className="text-2xl font-bold text-white">{status?.activeBots ?? 0}</p>
          </div>
          <div className={`rounded-2xl p-5 border ${status?.pairingPaused ? 'bg-red-500/10 border-red-500/40' : 'bg-slate-900/60 border-slate-800'}`}>
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-2"><Power size={16} /> New Pairing</div>
            <button onClick={togglePause} className={`text-sm font-bold px-4 py-2 rounded-lg ${status?.pairingPaused ? 'bg-red-500 text-white' : 'bg-emerald-600 text-white'}`}>
              {status?.pairingPaused ? 'PAUSED — Resume' : 'ACTIVE — Pause'}
            </button>
          </div>
        </div>

        {/* Bot table */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-950/60 text-slate-500 text-left">
                <tr>
                  <th className="p-4">Bot</th>
                  <th className="p-4">Phone</th>
                  <th className="p-4">Msgs</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {bots.map((b) => (
                  <tr key={b.session_id} className="border-t border-slate-800 text-slate-300">
                    <td className="p-4 font-semibold text-white">{b.bot_name}</td>
                    <td className="p-4">{b.phone_number}</td>
                    <td className="p-4">{b.message_count ?? 0}</td>
                    <td className="p-4">
                      {b.is_abusive
                        ? <span className="text-red-400 text-xs font-bold">FLAGGED</span>
                        : <span className="text-emerald-400 text-xs">{b.status || 'online'}</span>}
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => flagBot(b.session_id, !b.is_abusive)} className="p-2 rounded-lg bg-slate-800 hover:bg-amber-500/20 text-amber-400" title="Flag / unflag">
                          <Flag size={15} />
                        </button>
                        <button onClick={() => deleteBot(b.session_id)} className="p-2 rounded-lg bg-slate-800 hover:bg-red-500/20 text-red-400" title="Delete">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {bots.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-slate-500">No bots registered.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// tiny inline icon to avoid an extra import name clash
function Bot16() {
  return <ShieldCheck size={16} />;
}
