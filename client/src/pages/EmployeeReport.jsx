import { useEffect, useState } from 'react';
import { api, daysAgo, today, dayLabel } from '../api.js';

const cls = { 'تأخير': 'late', 'غائب': 'absent', 'حاضر': 'ok' };

export default function EmployeeReport() {
  const [emps, setEmps] = useState([]);
  const [code, setCode] = useState('');
  const [from, setFrom] = useState(daysAgo(14));
  const [to, setTo] = useState(today());
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => { api('/api/employees').then(setEmps).catch((e) => setErr(e.message)); }, []);

  async function show(e) {
    e.preventDefault();
    setErr('');
    try {
      setData(await api(`/api/reports/employee?code=${encodeURIComponent(code)}&from=${from}&to=${to}`));
    } catch (x) {
      setData(null);
      setErr(x.message);
    }
  }

  const emp = data?.employee;
  return (
    <>
      <form className="card row" onSubmit={show}>
        <select value={code} onChange={(e) => setCode(e.target.value)}>
          <option value="">اختار الموظف</option>
          {emps.map((x) => <option key={x.code} value={x.code}>{x.code} - {x.name}</option>)}
        </select>
        <label>من <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>إلى <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button className="btn">عرض</button>
      </form>
      {err && <p className="note bad">{err}</p>}

      {emp && (
        <>
          <section className="card">
            <h2>بيانات الموظف</h2>
            <dl className="info">
              <div><dt>الكود</dt><dd>{emp.code}</dd></div>
              <div><dt>الاسم</dt><dd>{emp.name}</dd></div>
              <div><dt>الوظيفة</dt><dd>{emp.job || '-'}</dd></div>
              <div><dt>الحالة</dt><dd>{emp.statusLabel}</dd></div>
              <div><dt>الهوية</dt><dd>{emp.nationalId || '-'}</dd></div>
              <div><dt>التعيين</dt><dd>{emp.hireDate ?? '-'}</dd></div>
              <div><dt>الدوام</dt><dd dir="ltr">{emp.shiftStart ? `${emp.shiftStart} - ${emp.shiftEnd}` : '-'}</dd></div>
              <div><dt>الإجازة</dt><dd>{emp.weeklyOff.map(dayLabel).join('، ') || '-'}</dd></div>
            </dl>
          </section>
          <section className="card table-wrap">
            <table>
              <thead><tr><th>التاريخ</th><th>اليوم</th><th>الحضور</th><th>الانصراف</th><th>التأخير (د)</th><th>الحالة</th></tr></thead>
              <tbody>
                {data.days.map((d) => (
                  <tr key={d.date}>
                    <td>{d.date}</td><td>{d.dayName}</td><td>{d.checkIn ?? '-'}</td><td>{d.checkOut ?? '-'}</td>
                    <td>{d.lateMinutes || '-'}</td><td className={cls[d.status]}>{d.status}</td>
                  </tr>
                ))}
                {!data.days.length && <tr><td colSpan={6} className="muted">لا توجد أيام في هذه الفترة</td></tr>}
              </tbody>
            </table>
          </section>
        </>
      )}
    </>
  );
}
