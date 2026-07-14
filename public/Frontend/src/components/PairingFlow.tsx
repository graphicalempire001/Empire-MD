import React, { useState, useEffect, useRef } from 'react';

type Step = 'form' | 'pairing' | 'success';
type PairingFormat = 'code' | 'qr';

const PairingFlow: React.FC = () => {
  const [step, setStep] = useState<Step>('form');
  const [pairingFormat, setPairingFormat] = useState<PairingFormat>('code');

  const [botName, setBotName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Kick off a connection using whichever format the user chose.
  const startConnection = async () => {
    setError(null);

    if (!botName.trim()) {
      setError('Please enter a bot name.');
      return;
    }
    if (pairingFormat === 'code' && !/^[1-9][0-9]{7,14}$/.test(phoneNumber.trim())) {
      setError('Enter a valid number with country code, no + or spaces. E.g. 2348012345678');
      return;
    }

    setLoading(true);
    try {
      const endpoint = pairingFormat === 'code' ? '/api/connect' : '/api/qr-connect';
      const body =
        pairingFormat === 'code'
          ? { botName: botName.trim(), phoneNumber: phoneNumber.trim() }
          : { botName: botName.trim() };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error || 'Something went wrong. Please try again.');
        setLoading(false);
        return;
      }

      setSessionId(data.sessionId);
      setStep('pairing');
      startPolling(data.sessionId);
    } catch (e) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Poll the server for the code / qr / connected status.
  const startPolling = (sid: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/status/${sid}`);
        const data = await res.json();

        if (data.status === 'connected') {
          stopPolling();
          setStep('success');
        } else if (data.status === 'expired') {
          stopPolling();
          setError('This session expired. Please start again.');
          setStep('form');
        } else if (data.status === 'error') {
          stopPolling();
          setError(data.error || 'Connection error.');
        } else {
          if (data.pairingCode) setPairingCode(data.pairingCode);
          if (data.qr) setQrCode(data.qr);
          if (typeof data.secondsLeft === 'number') setSecondsLeft(data.secondsLeft);
        }
      } catch (_) {
        // transient network hiccup — keep polling
      }
    }, 2000);
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => () => stopPolling(), []);

  const copySession = async () => {
    if (!sessionId) return;
    try {
      await navigator.clipboard.writeText(sessionId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (_) {}
  };

  const reset = () => {
    stopPolling();
    setStep('form');
    setPairingCode(null);
    setQrCode(null);
    setSecondsLeft(null);
    setSessionId(null);
    setError(null);
  };

  return (
    <div className="pairing-flow">
      {/* STEP 1: FORM */}
      {step === 'form' && (
        <div className="pairing-card">
          <h3>Connect Your WhatsApp</h3>
          <p>Enter your details to get your personal connection.</p>

          {/* Format switcher: Pairing Code vs QR */}
          <div className="format-toggle" role="tablist">
            <button
              type="button"
              className={pairingFormat === 'code' ? 'toggle active' : 'toggle'}
              onClick={() => setPairingFormat('code')}
            >
              Pairing Code
            </button>
            <button
              type="button"
              className={pairingFormat === 'qr' ? 'toggle active' : 'toggle'}
              onClick={() => setPairingFormat('qr')}
            >
              QR Code (iPhone)
            </button>
          </div>

          <label>
            Bot Name
            <input
              type="text"
              value={botName}
              maxLength={30}
              onChange={(e) => setBotName(e.target.value)}
              placeholder="My Empire Bot"
            />
            <small>This will be your bot's display name. Max 30 chars.</small>
          </label>

          {pairingFormat === 'code' && (
            <label>
              Phone Number
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="2348012345678"
              />
              <small>Include country code. No spaces or dashes. E.g. 2348012345678</small>
            </label>
          )}

          {error && <div className="error-box">{error}</div>}

          <button className="primary-btn" onClick={startConnection} disabled={loading}>
            {loading ? 'Connecting…' : pairingFormat === 'code' ? 'Get Pairing Code' : 'Generate QR Code'}
          </button>

          <small className="privacy-note">
            Your number is never stored publicly. This is your own personal bot connection.
          </small>
        </div>
      )}

      {/* STEP 2: PAIRING / QR */}
      {step === 'pairing' && (
        <div className="pairing-card">
          <h3>{pairingFormat === 'code' ? 'Enter Pairing Code' : 'Scan QR Code'}</h3>

          {pairingFormat === 'code' ? (
            <>
              <p>
                Open WhatsApp → <strong>Linked Devices</strong> → <strong>Link a Device</strong> →{' '}
                <strong>Link with phone number instead</strong>
              </p>
              <div className="pairing-code">
                {pairingCode ? pairingCode : 'Generating code…'}
              </div>
            </>
          ) : (
            <>
              <p>
                Open WhatsApp → <strong>Linked Devices</strong> → <strong>Link a Device</strong> and point
                your phone's camera at this screen.
              </p>
              <div className="qr-wrap">
                {qrCode ? (
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                      qrCode
                    )}`}
                    alt="WhatsApp QR Code"
                  />
                ) : (
                  <p>Generating QR…</p>
                )}
              </div>
            </>
          )}

          <p className="waiting">
            Waiting for WhatsApp to confirm
            {secondsLeft != null ? ` · ${secondsLeft}s expires` : ''}
          </p>

          {error && <div className="error-box">{error}</div>}

          <button className="ghost-btn" onClick={reset}>
            Start over
          </button>
        </div>
      )}

      {/* STEP 3: SUCCESS */}
      {step === 'success' && (
        <div className="pairing-card success">
          <h3>🎉 Your Bot Is Live!</h3>
          <p>Check your WhatsApp DM — a welcome message was just sent to you.</p>

          <div className="session-box" onClick={copySession}>
            <code>{sessionId}</code>
          </div>
          {copied && <p className="copied">✅ Session ID copied to clipboard!</p>}

          <p className="warn">⚠️ Keep your Session ID private — it's your bot's identity.</p>
        </div>
      )}
    </div>
  );
};

export default PairingFlow;
