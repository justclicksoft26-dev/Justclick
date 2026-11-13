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
    const t = setInterval(load, 30000); // keep the active period in sync
    return () => clearInterval(t);
  }, []);

  async function submit(status) {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await api('/attendance', { method: 'POST', body: { status } });
      setMessage(status === 'present' ? 'Attendance recorded: Present' : 'Attendance recorded: Absent');
      await load();
    } catch (err) {
      if (err.status === 401) return onLogout();
      setError(err.message);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <p className="muted">{error || 'Loading...'}</p>;

  const current = data.currentSlot;
  const recorded = data.records.find((r) => r.slot === current);

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

      <fieldset className="slots">
        <legend>Time period</legend>
        {data.slots.map((s) => {
          const rec = data.records.find((r) => r.slot === s.id);
          return (
            <label key={s.id} className={`slot ${s.id === current ? 'active' : 'disabled'}`}>
              <input type="radio" name="slot" value={s.id} checked={s.id === current} disabled={s.id !== current} readOnly />
              <span>{s.label}</span>
              {rec && <span className={`badge ${rec.status}`}>{rec.status === 'present' ? 'Present' : 'Absent'}</span>}
            </label>
          );
        })}
      </fieldset>

      {!current && <div className="alert info">Attendance is closed outside 8:00 - 4:00.</div>}
      {recorded && (
        <div className="alert info">
          Already recorded for this period: {recorded.status === 'present' ? 'Present' : 'Absent'}
        </div>
      )}
      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="actions">
        <button className="btn present" disabled={!current || !!recorded || busy} onClick={() => submit('present')}>
          Present
        </button>
        <button className="btn absent" disabled={!current || !!recorded || busy} onClick={() => submit('absent')}>
          Absent
        </button>
      </div>
    </>
  );
}
