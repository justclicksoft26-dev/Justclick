import { useState } from 'react';
import { api, daysAgo, today } from '../api.js';

export default function LateAbsentReport() {
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');

  async function show(e) {
    e.preventDefault();
    setErr('');
    try {
      setRows(await api(`/api/reports/late-absent?from=${from}&to=${to}`));
    } catch (x) {
      setRows(null);
      setErr(x.message);
    }
  }

  return (
    <>
      <form className="card row" onSubmit={show}>
        <label>من <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>إلى <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button className="btn">عرض</button>
      </form>
      {err && <p className="note bad">{err}</p>}
      {rows && (
        <section className="card table-wrap">
          <table>
            <thead><tr><th>الكود</th><th>الاسم</th><th>عدد التأخيرات</th><th>إجمالي دقائق التأخير</th><th>عدد الغيابات</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code}>
                  <td>{r.code}</td><td>{r.name}</td>
                  <td className="late">{r.lateCount}</td><td>{r.lateMinutes}</td><td className="absent">{r.absentCount}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={5} className="muted">لا يوجد موظفين نشطين</td></tr>}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
