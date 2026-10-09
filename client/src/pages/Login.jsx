import { useState } from 'react';
import { api, setToken } from '../api.js';
import { Alert, Icon, Spinner } from '../components/ui.jsx';

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
      <aside className="login-art">
        <div className="brand">
          <div className="brand-mark">JC</div>
          <div><b>Just Click</b><span>نظام الموارد البشرية</span></div>
        </div>
        <div>
          <h2>إدارة الحضور والانصراف بدقة وسهولة</h2>
          <p>ربط مباشر مع أجهزة البصمة، وترحيل المواعيد الفعلية، وتقارير التأخير والغياب في مكان واحد.</p>
        </div>
        <ul>
          <li><Icon name="fingerprint" />سحب البصمات من الجهاز تلقائيا</li>
          <li><Icon name="calendar" />العطلات الرسمية والإجازات الأسبوعية</li>
          <li><Icon name="chart" />تقارير التأخيرات وأيام الخصم</li>
        </ul>
      </aside>
      <div className="login-form-wrap">
        <form className="login-card" onSubmit={submit}>
          <div>
            <h1>تسجيل الدخول</h1>
            <p className="muted">سجّل دخولك بحساب النظام للمتابعة</p>
          </div>
          <label className="field">
            <span className="field-label">اسم المستخدم</span>
            <input dir="ltr" autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">كلمة المرور</span>
            <input dir="ltr" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {msg && <Alert tone="danger">{msg}</Alert>}
          <button className="btn" disabled={busy}>{busy && <Spinner />}{busy ? 'جاري الدخول...' : 'دخول'}</button>
        </form>
      </div>
    </div>
  );
}
