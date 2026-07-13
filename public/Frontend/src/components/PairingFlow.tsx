import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Smartphone, Bot, Loader2, CheckCircle2, Copy, AlertCircle, X, RefreshCw
} from 'lucide-react';

interface PairingFlowProps {
  open: boolean;
  onClose: () => void;
}

type Step = 1 | 2 | 3;

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

  // Reset everything when the modal closes
  const resetAll = useCallback(() => {
    setStep(1);
    setBotName('');
    setPhone('');
    setSessionId('');
    setPairingCode('');
    setSecondsLeft(null);
    setLoading(false);
    setError('');
    setCopied(null);
  }, []);

  const handleClose = () => {
    resetAll();
    onClose();
  };

  const startPairing = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phone, botName }),
      });
      const data = await res.json();
      if (data.success) {
        setSessionId(data.sessionId);
        setStep(2);
      } else {
        setError(data.error || 'Connection failed. Please try again.');
      }
    } catch {
      setError('Server unreachable. Check your connection and retry.');
    }
    setLoading(false);
  };

  // Poll status once we have a session and we're on step 2
  useEffect(() => {
    if (step !== 2 || !sessionId) return;
    let active = true;

    const poll = async () => {
      try {
        const res = await fetch(`/api/status/${sessionId}`);
        const data = await res.json();
        if (!active) return;
        if (data.pairingCode) setPairingCode(data.pairingCode);
        if (typeof data.secondsLeft === 'number') setSecondsLeft(data.secondsLeft);
        if (data.status === 'connected') setStep(3);
        if (data.status === 'error') { setError(data.error || 'Pairing error.'); setStep(1); }
        if (data.status === 'expired') { setError('Session expired. Please restart.'); setStep(1); }
      } catch {
        /* transient network hiccup — keep polling */
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => { active = false; clearInterval(interval); };
  }, [step, sessionId]);

  const copy = (text: string, which: 'code' | 'session') => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 1800);
    });
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={handleClose}
        />

        {/* Modal card */}
        <motion.div
          className="relative w-full max-w-md bg-slate-900/80 border border-slate-700/60 rounded-3xl backdrop-blur-2xl shadow-2xl p-6 sm:p-8"
          initial={{ opacity: 0, scale: 0.94, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        >
          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>

          {/* Step progress */}
          <div className="flex items-center gap-2 mb-6">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  step >= (s as Step) ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              />
            ))}
          </div>

          <AnimatePresence mode="wait">
            {/* STEP 1 — details */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
              >
                <h3 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
                  <Bot className="text-emerald-400" /> Create Your Bot
                </h3>
                <p className="text-slate-400 mb-6 text-sm">
                  Enter your details to generate a unique pairing code.
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase ml-1">
                      Bot Display Name
                    </label>
                    <input
                      type="text"
                      value={botName}
                      maxLength={30}
                      onChange={(e) => setBotName(e.target.value)}
                      placeholder="e.g. Empire Assistant"
                      className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:ring-2 focus:ring-emerald-500 outline-none transition"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase ml-1">
                      WhatsApp Number
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="2348012345678 (country code, no +)"
                      className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:ring-2 focus:ring-emerald-500 outline-none transition"
                    />
                  </div>

                  {error && (
                    <p className="text-red-400 text-xs flex items-center gap-1">
                      <AlertCircle size={14} /> {error}
                    </p>
                  )}

                  <button
                    onClick={startPairing}
                    disabled={loading || !botName.trim() || !phone.trim()}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="animate-spin" size={20} /> : 'Get Pairing Code'}
                  </button>

                  <p className="text-[11px] text-slate-600 text-center">
                    Your number is never stored publicly. This is your own private bot.
                  </p>
                </div>
              </motion.div>
            )}

            {/* STEP 2 — pairing code */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                className="text-center"
              >
                <div className="w-16 h-16 bg-emerald-500/15 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Smartphone className="text-emerald-400 animate-pulse" />
                </div>
                <h3 className="text-xl font-bold text-white mb-1">Link Your Device</h3>
                <p className="text-slate-400 text-sm mb-6">
                  Open WhatsApp → <b>Linked Devices</b> → <b>Link a Device</b> →{' '}
                  <b>Link with phone number</b>
                </p>

                <div className="bg-slate-950 border-2 border-dashed border-slate-700 rounded-2xl p-6 mb-3">
                  <span className="text-3xl sm:text-4xl font-mono font-black tracking-[0.2em] text-emerald-400">
                    {pairingCode || '···· ····'}
                  </span>
                </div>

                {pairingCode && (
                  <button
                    onClick={() => copy(pairingCode.replace(/-/g, ''), 'code')}
                    className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1 mb-4"
                  >
                    <Copy size={13} /> {copied === 'code' ? 'Copied!' : 'Copy code'}
                  </button>
                )}

                <p className="text-xs text-slate-500 italic flex items-center justify-center gap-1">
                  <Loader2 size={12} className="animate-spin" />
                  Waiting for WhatsApp confirmation
                  {secondsLeft != null ? ` · ${secondsLeft}s` : ''}
                </p>

                <button
                  onClick={() => { resetAll(); }}
                  className="mt-5 text-xs text-slate-500 hover:text-white inline-flex items-center gap-1"
                >
                  <RefreshCw size={13} /> Try a different number
                </button>
              </motion.div>
            )}

            {/* STEP 3 — success */}
            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="text-center"
              >
                <CheckCircle2 className="text-emerald-500 w-16 h-16 mx-auto mb-4" />
                <h3 className="text-2xl font-bold text-white mb-1">🎉 Your Bot Is Live!</h3>
                <p className="text-slate-400 text-sm mb-6">
                  A welcome message was just sent to your WhatsApp. Save your Session ID below.
                </p>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between gap-2 mb-4">
                  <code className="text-emerald-300 text-xs truncate">{sessionId}</code>
                  <button
                    onClick={() => copy(sessionId, 'session')}
                    className="text-slate-500 hover:text-white shrink-0"
                    aria-label="Copy session ID"
                  >
                    <Copy size={18} />
                  </button>
                </div>
                {copied === 'session' && (
                  <p className="text-emerald-400 text-xs mb-3">✅ Copied to clipboard!</p>
                )}

                <button
                  onClick={handleClose}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl transition-all"
                >
                  Done
                </button>
                <p className="text-[11px] text-slate-600 mt-3">
                  ⚠️ Keep your Session ID private — it's your bot's identity.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
