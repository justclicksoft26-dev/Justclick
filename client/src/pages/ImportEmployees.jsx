import { useRef, useState } from 'react';
import { api, getToken } from '../api.js';

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
      <section className="card">
        <h2>رفع بيانات الموظفين من Excel</h2>
        <p className="muted-note">
          الأعمدة: الكود، الاسم، رقم الهوية، الوظيفة، تاريخ التعيين، بداية الدوام، نهاية الدوام، الإجازة الأسبوعية (مثال: الجمعة، السبت)،
          والاختياري: الحالة (الافتراضي نشط) والسماحية (الافتراضي 15 دقيقة). الصف الأول هو العناوين.
        </p>
        <div
          className={`dropzone${drag ? ' over' : ''}`}
          onClick={() => inputRef.current.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
        >
          {file ? file.name : 'اسحب ملف Excel هنا أو اضغط للاختيار'}
          <input ref={inputRef} type="file" accept=".xlsx" hidden onChange={(e) => pick(e.target.files[0])} />
        </div>
        <div className="actions">
          <button className="btn" disabled={!file || busy} onClick={upload}>{busy ? 'جاري الرفع...' : 'رفع وإنشاء الموظفين'}</button>
          <button className="btn" type="button" onClick={template}>تحميل نموذج Excel</button>
        </div>
        {err && <p className="note bad">{err}</p>}
        {result && (
          <div className="note ok">
            تم إنشاء {result.created} موظف من {result.total}.
            {result.failed.length > 0 && <span className="bad"> تعذر {result.failed.length}:</span>}
          </div>
        )}
      </section>
      {result?.failed.length > 0 && (
        <section className="card table-wrap">
          <table>
            <thead><tr><th>السطر</th><th>الكود</th><th>الاسم</th><th>السبب</th></tr></thead>
            <tbody>
              {result.failed.map((f) => (
                <tr key={f.line}><td>{f.line}</td><td>{f.code || '-'}</td><td>{f.name || '-'}</td><td className="absent">{f.reasons.join('، ')}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
