import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, Bot, Loader2, CheckCircle2, Copy, AlertCircle } from 'lucide-react';

export default function PairingFlow() {
  const [step, setStep] = useState(1);
  const [botName, setBotName] = useState('');
  const [phone, setPhone] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const startPairing = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phone, botName })
      });
      const data = await res.json();
      if (data.success) {
        setSessionId(data.sessionId);
        setStep(2);
      } else {
        setError(data.error || 'Connection failed');
      }
    } catch (err) {
      setError('Server unreachable');
    }
    setLoading(false);
  };

  useEffect(() => {
    let interval: any;
    if (step === 2 && sessionId) {
      interval = setInterval(async () => {
        const res = await fetch(`/api/status/${sessionId}`);
        const data = await res.json();
        if (data.pairingCode) setPairingCode(data.pairingCode);
        if (data.status === 'connected') setStep(3);
        if (data.status === 'expired') {
          setError('Session expired. Please restart.');
          setStep(1);
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [step, sessionId]);

  return (
    <div className="max-w-md mx-auto p-6 bg-slate-900/50 border border-slate-800 rounded-3xl backdrop-blur-xl shadow-2xl">
      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div key="step1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <h3 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
              <Bot className="text-blue-400" /> Create Your Bot
            </h3>
            <p className="text-slate-400 mb-6 text-sm">Enter details to generate your unique pairing code.</p>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase ml-1">Bot Display Name</label>
                <input 
                  type="text" value={botName} onChange={(e) => setBotName(e.target.value)}
                  placeholder="e.g. Empire Assistant"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase ml-1">WhatsApp Number</label>
                <input 
                  type="text" value={phone} onChange={(e) => setPhone(e.target.value)}
                  placeholder="234..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              {error && <p className="text-red-400 text-xs flex items-center gap-1"><AlertCircle size={14}/> {error}</p>}
              <button 
                onClick={startPairing} disabled={loading || !botName || !phone}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="animate-spin" /> : 'Get Pairing Code'}
              </button>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="step2" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Smartphone className="text-blue-400 animate-pulse" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Link Your Device</h3>
              <p className="text-slate-400 text-sm mb-6">Open WhatsApp &gt; Linked Devices &gt; Link a Device &gt; Link with phone number</p>
              
              <div className="bg-slate-950 border-2 border-dashed border-slate-800 rounded-2xl p-6 mb-4">
                <span className="text-4xl font-mono font-black tracking-widest text-blue-400">
                  {pairingCode || '---- ----'}
                </span>
              </div>
              <p className="text-xs text-slate-500 italic">Waiting for WhatsApp confirmation...</p>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div key="step3" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="text-center">
              <CheckCircle2 className="text-green-500 w-16 h-16 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-white mb-2">Bot is Live!</h3>
              <p className="text-slate-400 text-sm mb-6">Your session is active. Save your ID for configuration.</p>
              
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                <code className="text-blue-300 text-xs truncate mr-2">{sessionId}</code>
                <button onClick={() => navigator.clipboard.writeText(sessionId)} className="text-slate-500 hover:text-white">
                  <Copy size={18} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
