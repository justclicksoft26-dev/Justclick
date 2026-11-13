import { useState } from 'react';
import { api } from '../api.js';

const DOMAIN = '@horizon.sch.sa';

export default function Login({ onSuccess }) {
  const [step, setStep] = useState('email'); // email | otp
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  async function sendCode(e) {
    e?.preventDefault();
    setError('');
    setInfo('');
    const clean = email.trim().toLowerCase();
    // domain is validated by the server (can be skipped there for testing)
    setLoading(true);
    try {
      const r = await api('/auth/request-otp', { method: 'POST', body: { email: clean } });
      setEmail(clean);
      setStep('otp');
      setInfo(`A 6-digit code was sent to ${clean}` + (r.devOtp ? ` (dev code: ${r.devOtp})` : ''));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function verify(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const r = await api('/auth/verify-otp', { method: 'POST', body: { email, code } });
      onSuccess(r.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1>Staff Attendance</h1>
      <p className="muted">Sign in with your school email</p>

      {step === 'email' ? (
        <form onSubmit={sendCode}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            placeholder={`name${DOMAIN}`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            required
          />
          {error && <div className="alert error">{error}</div>}
          <button className="btn primary" disabled={loading}>
            {loading ? 'Sending...' : 'Send verification code'}
          </button>
        </form>
      ) : (
        <form onSubmit={verify}>
          {info && <div className="alert info">{info}</div>}
          <label htmlFor="code">Verification code</label>
          <input
            id="code"
            inputMode="numeric"
            maxLength={6}
            placeholder="------"
            className="otp"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            autoFocus
            required
          />
          {error && <div className="alert error">{error}</div>}
          <button className="btn primary" disabled={loading || code.length !== 6}>
            {loading ? 'Verifying...' : 'Verify'}
          </button>
          <div className="row">
            <button type="button" className="link" onClick={sendCode} disabled={loading}>
              Resend code
            </button>
            <button
              type="button"
              className="link"
              onClick={() => {
                setStep('email');
                setCode('');
                setError('');
              }}
            >
              Change email
            </button>
          </div>
        </form>
      )}
    </>
  );
}
