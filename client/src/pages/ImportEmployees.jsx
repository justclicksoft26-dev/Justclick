import { useRef, useState } from 'react';
import { api, getToken } from '../api.js';
import { Alert, Badge, Icon, PageHeader, Spinner } from '../components/ui.jsx';

export default function ImportEmployees() {
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef();

  const pick = (f) => {
    setErr('');
    setResult(null);
    if (f && !/\.xlsx$/i.test(f.name)) return setErr('الملف لازم يكون بصيغة xlsx');
    setFile(f ?? null);
  };

  async function upload() {
    setBusy(true);
    setErr('');
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      setResult(await api('/api/employees/import', { method: 'POST', form }));
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function template() {
    const res = await fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/employees/template`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) return setErr('تعذر تحميل النموذج');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await res.blob());
    a.download = 'employees-template.xlsx';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <PageHeader title="رفع موظفين من Excel" subtitle="إضافة مجموعة موظفين دفعة واحدة من ملف Excel">
        <button className="btn ghost" type="button" onClick={template}><Icon name="download" size={16} />تحميل نموذج Excel</button>
      </PageHeader>

      <section className="card">
        <div className="card-title"><Icon name="file" />الأعمدة المطلوبة</div>
        <p className="card-sub">الصف الأول هو العناوين. الأعمدة الاختيارية: الحالة (الافتراضي نشط) والسماحية (الافتراضي 15 دقيقة).</p>
        <div className="tag-list">
          {['الكود', 'الاسم', 'رقم الهوية', 'الوظيفة', 'تاريخ التعيين', 'بداية الدوام', 'نهاية الدوام', 'الإجازة الأسبوعية (مثال: الجمعة، السبت)'].map((c) => <span key={c} className="tag">{c}</span>)}
        </div>
      </section>

      <section className="card">
        <div
          className={`dropzone${drag ? ' over' : ''}`}
          onClick={() => inputRef.current.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
        >
          <Icon name="upload" size={32} />
          {file ? file.name : 'اسحب ملف Excel هنا أو اضغط للاختيار'}
          <input ref={inputRef} type="file" accept=".xlsx" hidden onChange={(e) => pick(e.target.files[0])} />
        </div>
        <div className="form-actions">
          <button className="btn" disabled={!file || busy} onClick={upload}>{busy && <Spinner />}{busy ? 'جاري الرفع...' : 'رفع وإنشاء الموظفين'}</button>
        </div>
        {err && <Alert tone="danger">{err}</Alert>}
        {result && (
          <Alert tone={result.failed.length ? 'warning' : 'success'}>
            تم إنشاء {result.created} موظف من {result.total}.
            {result.failed.length > 0 && <> تعذر {result.failed.length}، التفاصيل بالأسفل.</>}
          </Alert>
        )}
      </section>

      {result?.failed.length > 0 && (
        <section className="card flush">
          <div className="table-wrap">
            <table>
              <thead><tr><th>السطر</th><th>الكود</th><th>الاسم</th><th>السبب</th></tr></thead>
              <tbody>
                {result.failed.map((f) => (
                  <tr key={f.line}><td className="mono">{f.line}</td><td className="mono">{f.code || '-'}</td><td>{f.name || '-'}</td><td><Badge tone="danger">{f.reasons.join('، ')}</Badge></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
