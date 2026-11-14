import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Attendance({ onLogout }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setData(await api('/attendance/status'));
    } catch (err) {
      if (err.status === 401) return onLogout();
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // keep button states in sync with the clock
    return () => clearInterval(t);
  }, []);

  async function submit(type) {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const next = await api('/attendance', { method: 'POST', body: { type } });
      setData(next);
      setMessage(type === 'check_in' ? 'Check-in recorded successfully' : 'Check-out recorded successfully');
    } catch (err) {
      if (err.status === 401) return onLogout();
      setError(err.message);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <p className="muted">{error || 'Loading...'}</p>;

  const { checkIn, checkOut } = data;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Attendance</h1>
          <p className="muted">
            {data.email}
            <br />
            {data.date} - {data.time}
          </p>
        </div>
        <button className="link" onClick={onLogout}>Sign out</button>
      </div>

      <div className="actions col">
        <div>
          <button className="btn present" disabled={!checkIn.enabled || busy} onClick={() => submit('check_in')}>
            Check in {checkIn.done && `- ${checkIn.at}`}
          </button>
          {checkIn.note && <p className="hint">{checkIn.note}</p>}
        </div>
        <div>
          <button className="btn absent" disabled={!checkOut.enabled || busy} onClick={() => submit('check_out')}>
            Check out {checkOut.done && `- ${checkOut.at}`}
          </button>
          {checkOut.note && <p className="hint">{checkOut.note}</p>}
        </div>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}
    </>
  );
}
