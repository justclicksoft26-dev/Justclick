import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

export default function Pull() {
  const [ip, setIp] = useState('');
  const [port, setPort] = useState(4370);
  const [total, setTotal] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef();

  const refresh = () => api('/api/punches/count').then((r) => setTotal(r.total)).catch(() => {});
  useEffect(() => { refresh(); }, []);

  async function run(fn) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      setMsg({ ok: true, text: `تم: ${r.received} حركة، تم تخزين ${r.stored} وتجاهل ${r.ignored} (مكررة أو بين أول وآخر بصمة في اليوم)` });
      refresh();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  const pull = (e) => {
    e.preventDefault();
    run(() => api('/api/punches/pull', { method: 'POST', body: { ip, port } }));
  };

  const upload = (e) => {
    e.preventDefault();
    const file = fileRef.current.files[0];
    if (!file) return setMsg({ ok: false, text: 'اختار ملف CSV أولا' });
    const form = new FormData();
    form.append('file', file);
    run(() => api('/api/punches/upload', { method: 'POST', form }));
  };

  return (
    <>
      <form className="card" onSubmit={pull}>
        <h2>سحب البصمات من الجهاز</h2>
        <div className="row">
          <input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="IP الجهاز مثلاً 192.168.1.50" dir="ltr" />
          <input type="number" value={port} onChange={(e) => setPort(e.target.value)} style={{ width: 100 }} />
          <button className="btn" disabled={busy}>سحب</button>
        </div>
      </form>

      <form className="card" onSubmit={upload}>
        <h2>أو رفع ملف بصمات</h2>
        <p>الأعمدة: <code>code,timestamp</code> (مثال: <code dir="ltr">101,2026-10-01 08:58:00</code>)</p>
        <div className="row">
          <input type="file" accept=".csv,text/csv" ref={fileRef} />
          <button className="btn" disabled={busy}>رفع</button>
        </div>
      </form>

      {msg && <p className={msg.ok ? 'note ok' : 'note bad'}>{msg.text}</p>}
      <p>إجمالي الحركات المخزنة: <b>{total ?? '...'}</b></p>
    </>
  );
}
