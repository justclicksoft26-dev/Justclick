import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Alert, Field, Icon, PageHeader, Spinner, Stat } from '../components/ui.jsx';

export default function Pull() {
  const [ip, setIp] = useState('');
  const [port, setPort] = useState(4370);
  const [total, setTotal] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(null); // 'pull' | 'upload'
  const fileRef = useRef();

  const refresh = () => api('/api/punches/count').then((r) => setTotal(r.total)).catch(() => {});
  useEffect(() => { refresh(); }, []);

  async function run(kind, fn) {
    setBusy(kind);
    setMsg(null);
    try {
      const r = await fn();
      setMsg({ ok: true, text: `تم استلام ${r.received} حركة، تم تخزين ${r.stored} وتجاهل ${r.ignored} (مكررة أو بين أول وآخر بصمة في اليوم)` });
      refresh();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(null);
    }
  }

  const pull = (e) => {
    e.preventDefault();
    run('pull', () => api('/api/punches/pull', { method: 'POST', body: { ip, port } }));
  };

  const upload = (e) => {
    e.preventDefault();
    const file = fileRef.current.files[0];
    if (!file) return setMsg({ ok: false, text: 'اختار ملف CSV أولا' });
    const form = new FormData();
    form.append('file', file);
    run('upload', () => api('/api/punches/upload', { method: 'POST', form }));
  };

  return (
    <>
      <PageHeader title="سحب البصمة" subtitle="استيراد حركات الحضور والانصراف من جهاز البصمة أو من ملف CSV" />

      <div className="stats">
        <Stat label="إجمالي الحركات المخزنة" value={total?.toLocaleString('en-US')} icon="fingerprint" />
      </div>

      <div className="grid two" style={{ alignItems: 'stretch' }}>
        <form className="card" onSubmit={pull}>
          <div className="card-title"><Icon name="wifi" />السحب من الجهاز</div>
          <p className="card-sub">اتصال مباشر بجهاز البصمة عبر الشبكة المحلية.</p>
          <div className="grid two">
            <Field label="عنوان الجهاز (IP)"><input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="192.168.1.50" dir="ltr" /></Field>
            <Field label="المنفذ"><input type="number" value={port} onChange={(e) => setPort(e.target.value)} dir="ltr" /></Field>
          </div>
          <div className="form-actions">
            <button className="btn" disabled={!!busy}>{busy === 'pull' ? <Spinner /> : <Icon name="download" size={16} />}{busy === 'pull' ? 'جاري السحب...' : 'سحب البصمات'}</button>
          </div>
        </form>

        <form className="card" onSubmit={upload}>
          <div className="card-title"><Icon name="file" />رفع ملف بصمات</div>
          <p className="card-sub">الأعمدة: <code>code,timestamp</code> — مثال: <code dir="ltr">101,2026-10-01 08:58:00</code></p>
          <input type="file" accept=".csv,text/csv" ref={fileRef} />
          <div className="form-actions">
            <button className="btn" disabled={!!busy}>{busy === 'upload' ? <Spinner /> : <Icon name="upload" size={16} />}{busy === 'upload' ? 'جاري الرفع...' : 'رفع الملف'}</button>
          </div>
        </form>
      </div>

      {msg && <Alert tone={msg.ok ? 'success' : 'danger'}>{msg.text}</Alert>}
    </>
  );
}
