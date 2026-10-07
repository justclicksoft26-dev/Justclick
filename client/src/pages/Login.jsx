import { useState } from 'react';
import { api, setToken } from '../api.js';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await api('/api/auth/login', { method: 'POST', body: { username, password } });
      setToken(r.token);
      onLogin(r.user);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <h2>تسجيل الدخول</h2>
        <label className="field">اسم المستخدم
          <input dir="ltr" autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className="field">كلمة المرور
          <input dir="ltr" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {msg && <span className="note bad">{msg}</span>}
        <button className="btn" disabled={busy}>{busy ? 'جاري الدخول...' : 'دخول'}</button>
      </form>
    </div>
  );
}
