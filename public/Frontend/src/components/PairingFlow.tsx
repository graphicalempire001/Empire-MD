import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, Bot, Loader2, CheckCircle2, Copy, AlertCircle, X, RefreshCw, Terminal, QrCode } from 'lucide-react';

interface PairingFlowProps {
  open: boolean;
  onClose: () => void;
}
type Step = 1 | 2 | 3;
type LogLine = { t: string; msg: string };
type PairingFormat = 'code' | 'qr';

export default function PairingFlow({ open, onClose }: PairingFlowProps) {
  const [step, setStep] = useState<Step>(1);
  const [botName, setBotName] = useState('');
  const [phone, setPhone] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [pairingFormat, setPairingFormat] = useState<PairingFormat>('code');
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
    setPairingCode(''); setQrCode(''); setPairingFormat('code'); setSecondsLeft(null); setLoading(false);
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
        pushLog('▶ Requesting pairing state from WhatsApp...');
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
    let qrShown = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/status/${sessionId}`);
        const data = await res.json();
        if (!active) return;
        if (data.pairingCode) {
          setPairingCode(data.pairingCode);
          if (!codeShown) { pushLog(`✔ Pairing code ready: ${data.pairingCode}`); codeShown = true; }
        }
        if (data.qrCode) {
          setQrCode(data.qrCode);
          if (!qrShown) { pushLog('✔ QR Code generated and ready to scan!'); qrShown = true; }
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
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#8e8e8e] uppercase mb-1">
        <Terminal size={12} /> {label}
      </div>
      <div className="bg-white/70 border border-black/[0.06] rounded-xl p-3 h-28 overflow-y-auto font-mono text-[11px] leading-relaxed backdrop-blur-sm">
        {log.length === 0 ? (
          <span className="text-[#b0b0b8]">Awaiting activity…</span>
        ) : (
          log.map((l, i) => (
            <div key={i} className="text-[#5a5a63]">
              <span className="text-[#b0b0b8]">[{l.t}]</span>{' '}
              <span className={l.msg.startsWith('✖') ? 'text-[#e5484d]' : l.msg.startsWith('✔') ? 'text-[#00A884]' : 'text-[#1a1a1a]'}>{l.msg}</span>
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
        {/* Light backdrop with the same base tone */}
        <div className="absolute inset-0 bg-[#EDEEF5]/70 backdrop-blur-sm" onClick={handleClose} />

        <motion.div
          className="glass-card relative w-full max-w-md max-h-[92vh] overflow-y-auto rounded-3xl shadow-2xl p-6 sm:p-8"
          initial={{ opacity: 0, scale: 0.94, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 20 }} transition={{ type: 'spring', stiffness: 300, damping: 26 }}>
          {/* soft green glow accents */}
          <div className="pointer-events-none absolute -top-16 -left-16 w-56 h-56 rounded-full bg-[#00A884]/10 blur-3xl"></div>
          <div className="pointer-events-none absolute -bottom-20 -right-12 w-64 h-64 rounded-full bg-[#9fff00]/10 blur-3xl"></div>

          <button onClick={handleClose} className="absolute top-4 right-4 text-[#8e8e8e] hover:text-[#1a1a1a] transition-colors z-10" aria-label="Close"><X size={20} /></button>

          {/* Progress bar */}
          <div className="flex items-center gap-2 mb-6 relative z-10">
            {[1, 2, 3].map((s) => (
              <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${step >= (s as Step) ? 'bg-gradient-green' : 'bg-black/[0.08]'}`} />
            ))}
          </div>

          <div className="relative z-10">
            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div key="step1" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
                  <h3 className="text-2xl font-bold text-[#1a1a1a] mb-1 flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
                    <Bot className="text-[#00A884]" /> Connect Your <span className="text-gradient-green">WhatsApp</span>
                  </h3>
                  <p className="body-text mb-6">Enter your details to get your personal pairing code.</p>
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-[#8e8e8e] uppercase ml-1">Bot Name *</label>
                      <input type="text" value={botName} maxLength={30} onChange={(e) => setBotName(e.target.value)} placeholder="e.g. Empire Assistant"
                        className="mt-1 w-full bg-white/80 border border-black/[0.06] rounded-xl px-4 py-3 text-[#1a1a1a] placeholder:text-[#b0b0b8] focus:ring-2 focus:ring-[#00A884]/30 focus:border-[#00A884] outline-none transition" />
                      <p className="text-[11px] text-[#8e8e8e] mt-1 ml-1">This will be your bot's display name. Max 30 chars.</p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-[#8e8e8e] uppercase ml-1">WhatsApp Number *</label>
                      <div className="mt-1 flex items-center bg-white/80 border border-black/[0.06] rounded-xl focus-within:ring-2 focus-within:ring-[#00A884]/30 focus-within:border-[#00A884] transition">
                        <span className="pl-4 pr-1 text-[#8e8e8e]">+</span>
                        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="2348012345678"
                          className="flex-1 bg-transparent py-3 pr-4 text-[#1a1a1a] placeholder:text-[#b0b0b8] outline-none" />
                      </div>
                      <p className="text-[11px] text-[#8e8e8e] mt-1 ml-1">Include country code. No spaces or dashes. E.g. 2348012345678</p>
                    </div>
                    {error && <p className="text-[#e5484d] text-xs flex items-center gap-1"><AlertCircle size={14} /> {error}</p>}
                    <motion.button whileTap={{ scale: 0.97 }} whileHover={{ y: -2 }} onClick={startPairing} disabled={loading || !botName.trim() || !phone.trim()}
                      className="whatsapp-btn w-full py-4 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                      {loading ? <><Loader2 className="animate-spin" size={20} /> Connecting to WhatsApp...</> : 'Get Pairing Code'}
                    </motion.button>
                    <LogBox label="Process Log" />
                    <p className="text-[11px] text-[#8e8e8e] text-center">Your number is never stored publicly. This is your own personal bot connection.</p>
                  </div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div key="step2" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="text-center">
                  <div className="w-16 h-16 bg-[#00A884]/15 rounded-full flex items-center justify-center mx-auto mb-4">
                    {pairingFormat === 'code' ? <Smartphone className="text-[#00A884] animate-pulse" /> : <QrCode className="text-[#00A884]" />}
                  </div>
                  <h3 className="text-xl font-bold text-[#1a1a1a] mb-1" style={{ fontFamily: 'var(--font-display)' }}>
                    {pairingFormat === 'code' ? 'Enter Pairing Code' : 'Scan QR Code'}
                  </h3>
                  
                  {/* Format Switch Toggle */}
                  <div className="flex justify-center gap-2 mb-4 mt-2">
                    <button
                      onClick={() => setPairingFormat('code')}
                      className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${pairingFormat === 'code' ? 'bg-[#00A884] text-white' : 'bg-black/[0.05] text-[#5a5a63] hover:bg-black/[0.1]'}`}
                    >
                      Pairing Code
                    </button>
                    <button
                      onClick={() => setPairingFormat('qr')}
                      className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${pairingFormat === 'qr' ? 'bg-[#00A884] text-white' : 'bg-black/[0.05] text-[#5a5a63] hover:bg-black/[0.1]'}`}
                    >
                      QR Code (iPhones/Web)
                    </button>
                  </div>

                  {pairingFormat === 'code' ? (
                    <>
                      <p className="body-text mb-6">Open WhatsApp → <b className="text-[#1a1a1a]">Linked Devices</b> → <b className="text-[#1a1a1a]">Link a Device</b> → <b className="text-[#1a1a1a]">Link with phone number instead</b></p>
                      <motion.div
                        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 240, damping: 18 }}
                        className="glass-card glow-green rounded-2xl p-6 mb-3">
                        <span className="text-3xl sm:text-4xl font-mono font-black tracking-[0.2em] text-[#1a1a1a]">{pairingCode || '···· ····'}</span>
                      </motion.div>
                      {pairingCode && (
                        <button onClick={() => copy(pairingCode.replace(/-/g, ''), 'code')} className="text-xs text-[#8e8e8e] hover:text-[#00A884] inline-flex items-center gap-1 mb-2 transition-colors">
                          <Copy size={13} /> {copied === 'code' ? 'Copied!' : 'Copy Code'}
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="body-text mb-4">Open WhatsApp → <b className="text-[#1a1a1a]">Linked Devices</b> → <b className="text-[#1a1a1a]">Link a Device</b> and point your phone's camera at this screen.</p>
                      <div className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl border border-black/[0.06] mb-3 mx-auto w-48 h-48">
                        {qrCode ? (
                          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrCode)}`} alt="WhatsApp QR Code" className="w-36 h-36" />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-center text-[#8e8e8e] text-xs gap-2">
                            <Loader2 className="animate-spin text-[#00A884]" size={24} />
                            <span>Generating QR...</span>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  <p className="text-xs text-[#8e8e8e] italic flex items-center justify-center gap-1">
                    <Loader2 size={12} className="animate-spin" /> Waiting for WhatsApp to confirm{secondsLeft != null ? ` · ${secondsLeft}s expires` : ''}
                  </p>
                  <LogBox label="Live Feed" />
                  <button onClick={() => resetAll()} className="mt-4 text-xs text-[#8e8e8e] hover:text-[#00A884] inline-flex items-center gap-1 transition-colors">
                    <RefreshCw size={13} /> Try Different Number
                  </button>
                </motion.div>
              )}

              {step === 3 && (
                <motion.div key="step3" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="text-center">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 12 }}>
                    <CheckCircle2 className="text-[#00A884] w-16 h-16 mx-auto mb-4" />
                  </motion.div>
                  <h3 className="text-2xl font-bold mb-1 text-gradient-green" style={{ fontFamily: 'var(--font-display)' }}>🎉 Your Bot Is Live!</h3>
                  <p className="body-text mb-6">Check your WhatsApp DM — a welcome message was just sent to you.</p>
                  <div className="bg-white/80 border border-black/[0.06] rounded-xl p-4 flex items-center justify-between gap-2 mb-2">
                    <code className="text-[#00A884] text-xs truncate font-mono">{sessionId}</code>
                    <button onClick={() => copy(sessionId, 'session')} className="text-[#8e8e8e] hover:text-[#1a1a1a] shrink-0 transition-colors" aria-label="Copy session ID"><Copy size={18} /></button>
                  </div>
                  {copied === 'session' && <p className="text-[#00A884] text-xs mb-3">✅ Session ID copied to clipboard!</p>}
                  <p className="text-[11px] text-[#8e8e8e] mb-5">⚠️ Keep your Session ID private — it's your bot's identity.</p>
                  <motion.button whileTap={{ scale: 0.97 }} whileHover={{ y: -2 }} onClick={handleClose} className="whatsapp-btn w-full py-3.5">Done</motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
