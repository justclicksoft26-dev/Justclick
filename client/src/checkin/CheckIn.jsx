import { useEffect, useState } from 'react';
import './checkin.css';

// Staff web check-in, shown at /attendance. Talks to /api/attendance (public OTP login, separate from the ERP login).
const BASE = import.meta.env.VITE_API_URL ?? '';
const KEY = 'checkin_token';
const getToken = () => sessionStorage.getItem(KEY);
const setToken = (t) => (t ? sessionStorage.setItem(KEY, t) : sessionStorage.removeItem(KEY));

async function call(path, { method = 'GET', body } = {}) {
  const token = getToken();
  let res;
  try {
    res = await fetch(`${BASE}/api/attendance${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error('Cannot reach the server'), { status: 0 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status });
  return data;
}

function Login({ onSuccess }) {
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
    setLoading(true);
    try {
      const r = await call('/request-otp', { method: 'POST', body: { email: clean } });
      if (r.token) return onSuccess(r.token); // server has OTP turned off: signed in directly
      setEmail(clean);
      setStep('otp');
      setInfo(`A 6-digit code was sent to ${clean}`);
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
      const r = await call('/verify-otp', { method: 'POST', body: { email, code } });
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
      <p className="ck-muted">Sign in with your school email</p>
      {step === 'email' ? (
        <form onSubmit={sendCode}>
          <label htmlFor="ck-email">Email</label>
          <input id="ck-email" type="email" placeholder="name@horizon.sch.sa" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
          {error && <div className="ck-alert error">{error}</div>}
          <button className="ck-btn primary" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
        </form>
      ) : (
        <form onSubmit={verify}>
          {info && <div className="ck-alert info">{info}</div>}
          <label htmlFor="ck-code">Verification code</label>
          <input id="ck-code" className="ck-otp" inputMode="numeric" maxLength={6} placeholder="------" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus required />
          {error && <div className="ck-alert error">{error}</div>}
          <button className="ck-btn primary" disabled={loading || code.length !== 6}>{loading ? 'Verifying...' : 'Verify'}</button>
          <div className="ck-row">
            <button type="button" className="ck-link" onClick={sendCode} disabled={loading}>Resend code</button>
            <button type="button" className="ck-link" onClick={() => { setStep('email'); setCode(''); setError(''); }}>Change email</button>
          </div>
        </form>
      )}
    </>
  );
}

function Today({ onLogout }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setData(await call('/status'));
    } catch (err) {
      if (err.status === 401) return onLogout();
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // keep the buttons in sync with the clock
    return () => clearInterval(t);
  }, []);

  async function submit(type) {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      setData(await call('/', { method: 'POST', body: { type } }));
      setMessage(type === 'check_in' ? 'Check-in recorded successfully' : 'Check-out recorded successfully');
    } catch (err) {
      if (err.status === 401) return onLogout();
      setError(err.message);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <p className="ck-muted">{error || 'Loading...'}</p>;
  const { checkIn, checkOut } = data;

  return (
    <>
      <div className="ck-top">
        <div>
          <h1>Attendance</h1>
          <p className="ck-muted">{data.email}<br />{data.date} - {data.time}</p>
        </div>
        <button className="ck-link" onClick={onLogout}>Sign out</button>
      </div>
      <div className="ck-actions">
        <div>
          <button className="ck-btn in" disabled={!checkIn.enabled || busy} onClick={() => submit('check_in')}>Check in {checkIn.done && `- ${checkIn.at}`}</button>
          {checkIn.note && <p className="ck-hint">{checkIn.note}</p>}
        </div>
        <div>
          <button className="ck-btn out" disabled={!checkOut.enabled || busy} onClick={() => submit('check_out')}>Check out {checkOut.done && `- ${checkOut.at}`}</button>
          {checkOut.note && <p className="ck-hint">{checkOut.note}</p>}
        </div>
      </div>
      {message && <div className="ck-alert success">{message}</div>}
      {error && <div className="ck-alert error">{error}</div>}
    </>
  );
}

export default function CheckIn() {
  const [authed, setAuthed] = useState(!!getToken());
  useEffect(() => { document.title = 'Attendance'; }, []);
  return (
    <div className="ck-shell">
      <div className="ck-card">
        {authed
          ? <Today onLogout={() => { setToken(null); setAuthed(false); }} />
          : <Login onSuccess={(t) => { setToken(t); setAuthed(true); }} />}
      </div>
    </div>
  );
}
