import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, Bot, Loader2, CheckCircle2, Copy, AlertCircle, X, RefreshCw, Terminal } from 'lucide-react';

interface PairingFlowProps {
  open: boolean;
  onClose: () => void;
}
type Step = 1 | 2 | 3;
type LogLine = { t: string; msg: string };

export default function PairingFlow({ open, onClose }: PairingFlowProps) {
  const [step, setStep] = useState<Step>(1);
  const [botName, setBotName] = useState('');
  const [phone, setPhone] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<'code' | 'session' | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  const pushLog = useCallback((msg: string) => {
    const t = new Date().toLocaleTimeString([], { hour12: false });
    setLog((prev) => [...prev, { t, msg }]);
  }, []);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [log]);

  const resetAll = useCallback(() => {
    setStep(1); setBotName(''); setPhone(''); setSessionId('');
    setPairingCode(''); setSecondsLeft(null); setLoading(false);
    setError(''); setCopied(null); setLog([]);
  }, []);

  const handleClose = () => { resetAll(); onClose(); };

  const startPairing = async () => {
    setLoading(true); setError('');
    pushLog('▶ Initializing connection...');
    pushLog(`▶ Validating number +${phone.replace(/[^0-9]/g, '')}`);
    try {
      pushLog('▶ Contacting Empire pairing engine...');
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phone, botName }),
      });
      const data = await res.json();
      if (data.success) {
        setSessionId(data.sessionId);
        pushLog(`✔ Session created: ${data.sessionId}`);
        pushLog('▶ Requesting pairing code from WhatsApp...');
        setStep(2);
      } else {
        pushLog(`✖ ${data.error || 'Connection failed'}`);
        setError(data.error || 'Connection failed. Please try again.');
      }
    } catch {
      pushLog('✖ Server unreachable.');
      setError('Server unreachable. Check your connection and retry.');
    }
    setLoading(false);
  };

  // Poll status + stream live feed
  useEffect(() => {
    if (step !== 2 || !sessionId) return;
    let active = true;
    let codeShown = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/status/${sessionId}`);
        const data = await res.json();
        if (!active) return;
        if (data.pairingCode) {
          setPairingCode(data.pairingCode);
          if (!codeShown) { pushLog(`✔ Pairing code ready: ${data.pairingCode}`); codeShown = true; }
        }
        if (typeof data.secondsLeft === 'number') setSecondsLeft(data.secondsLeft);
        if (data.status === 'connected') { pushLog('✔ WhatsApp confirmed! Bot is live.'); setStep(3); }
        if (data.status === 'error') { pushLog(`✖ ${data.error || 'Pairing error'}`); setError(data.error || 'Pairing error.'); setStep(1); }
        if (data.status === 'expired') { pushLog('✖ Session expired.'); setError('Session expired. Please restart.'); setStep(1); }
      } catch { /* transient — keep polling */ }
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => { active = false; clearInterval(interval); };
  }, [step, sessionId, pushLog]);

  const copy = (text: string, which: 'code' | 'session') => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 1800);
    });
  };

  if (!open) return null;

  const LogBox = ({ label }: { label: string }) => (
    <div className="mt-4 text-left">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase mb-1">
        <Terminal size={12} /> {label}
      </div>
      <div className="bg-black/60 border border-slate-800 rounded-xl p-3 h-28 overflow-y-auto font-mono text-[11px] leading-relaxed">
        {log.length === 0 ? (
          <span className="text-slate-600">Awaiting activity…</span>
        ) : (
          log.map((l, i) => (
            <div key={i} className="text-slate-400">
              <span className="text-slate-600">[{l.t}]</span>{' '}
              <span className={l.msg.startsWith('✖') ? 'text-red-400' : l.msg.startsWith('✔') ? 'text-emerald-400' : 'text-slate-300'}>{l.msg}</span>
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  );

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />
        <motion.div
          className="relative w-full max-w-md max-h-[92vh] overflow-y-auto bg-slate-900/80 border border-slate-700/60 rounded-3xl backdrop-blur-2xl shadow-2xl p-6 sm:p-8"
          initial={{ opacity: 0, scale: 0.94, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 20 }} transition={{ type: 'spring', stiffness: 300, damping: 26 }}>
          <button onClick={handleClose} className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors" aria-label="Close"><X size={20} /></button>

          <div className="flex items-center gap-2 mb-6">
            {[1, 2, 3].map((s) => (
              <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${step >= (s as Step) ? 'bg-emerald-500' : 'bg-slate-700'}`} />
            ))}
          </div>

          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
                <h3 className="text-2xl font-bold text-white mb-1 flex items-center gap-2"><Bot className="text-emerald-400" /> Connect Your WhatsApp</h3>
                <p className="text-slate-400 mb-6 text-sm">Enter your details to get your personal pairing code.</p>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase ml-1">Bot Name *</label>
                    <input type="text" value={botName} maxLength={30} onChange={(e) => setBotName(e.target.value)} placeholder="e.g. Empire Assistant"
                      className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:ring-2 focus:ring-emerald-500 outline-none transition" />
                    <p className="text-[11px] text-slate-600 mt-1 ml-1">This will be your bot's display name. Max 30 chars.</p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase ml-1">WhatsApp Number *</label>
                    <div className="mt-1 flex items-center bg-slate-950 border border-slate-800 rounded-xl focus-within:ring-2 focus-within:ring-emerald-500">
                      <span className="pl-4 pr-1 text-slate-500">+</span>
                      <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="2348012345678"
                        className="flex-1 bg-transparent py-3 pr-4 text-white placeholder:text-slate-600 outline-none" />
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1 ml-1">Include country code. No spaces or dashes. E.g. 2348012345678</p>
                  </div>
                  {error && <p className="text-red-400 text-xs flex items-center gap-1"><AlertCircle size={14} /> {error}</p>}
                  <button onClick={startPairing} disabled={loading || !botName.trim() || !phone.trim()}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2">
                    {loading ? <><Loader2 className="animate-spin" size={20} /> Connecting to WhatsApp...</> : 'Get Pairing Code'}
                  </button>
                  <LogBox label="Process Log" />
                  <p className="text-[11px] text-slate-600 text-center">Your number is never stored publicly. This is your own personal bot connection.</p>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="text-center">
                <div className="w-16 h-16 bg-emerald-500/15 rounded-full flex items-center justify-center mx-auto mb-4"><Smartphone className="text-emerald-400 animate-pulse" /></div>
                <h3 className="text-xl font-bold text-white mb-1">Enter Pairing Code</h3>
                <p className="text-slate-400 text-sm mb-6">Open WhatsApp → <b>Linked Devices</b> → <b>Link a Device</b> → <b>Enter Code Manually</b></p>
                <div className="bg-slate-950 border-2 border-dashed border-slate-700 rounded-2xl p-6 mb-3">
                  <span className="text-3xl sm:text-4xl font-mono font-black tracking-[0.2em] text-emerald-400">{pairingCode || '···· ····'}</span>
                </div>
                {pairingCode && (
                  <button onClick={() => copy(pairingCode.replace(/-/g, ''), 'code')} className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1 mb-2">
                    <Copy size={13} /> {copied === 'code' ? 'Copied!' : 'Copy Code'}
                  </button>
                )}
                <p className="text-xs text-slate-500 italic flex items-center justify-center gap-1">
                  <Loader2 size={12} className="animate-spin" /> Waiting for WhatsApp to confirm{secondsLeft != null ? ` · ${secondsLeft}s expires` : ''}
                </p>
                <LogBox label="Live Feed" />
                <button onClick={() => resetAll()} className="mt-4 text-xs text-slate-500 hover:text-white inline-flex items-center gap-1">
                  <RefreshCw size={13} /> Try Different Number
                </button>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div key="step3" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="text-center">
                <CheckCircle2 className="text-emerald-500 w-16 h-16 mx-auto mb-4" />
                <h3 className="text-2xl font-bold text-white mb-1">🎉 Your Bot Is Live!</h3>
                <p className="text-slate-400 text-sm mb-6">Check your WhatsApp DM — a welcome message was just sent to you.</p>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between gap-2 mb-2">
                  <code className="text-emerald-300 text-xs truncate">{sessionId}</code>
                  <button onClick={() => copy(sessionId, 'session')} className="text-slate-500 hover:text-white shrink-0" aria-label="Copy session ID"><Copy size={18} /></button>
                </div>
                {copied === 'session' && <p className="text-emerald-400 text-xs mb-3">✅ Session ID copied to clipboard!</p>}
                <p className="text-[11px] text-slate-600 mb-5">⚠️ Keep your Session ID private — it's your bot's identity.</p>
                <button onClick={handleClose} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl transition-all">Done</button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
