import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import Loading from '../Loading.jsx';

const cls = { 'تأخير': 'late', 'غائب': 'absent', 'حاضر': 'ok' };

function EmployeePicker({ employees, value, onChange }) {
  const [q, setQ] = useState('');
  const shown = useMemo(
    () => employees.filter((e) => `${e.code} ${e.name}`.includes(q.trim())),
    [employees, q],
  );
  const toggle = (code) => onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);
  const allShown = shown.length > 0 && shown.every((e) => value.includes(e.code));
  const toggleAll = () => {
    const codes = shown.map((e) => e.code);
    onChange(allShown ? value.filter((c) => !codes.includes(c)) : [...new Set([...value, ...codes])]);
  };
  return (
    <div className="picker">
      <div className="row">
        <input placeholder="بحث بالاسم أو الكود" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="btn" onClick={toggleAll}>{allShown ? 'إلغاء تحديد الظاهر' : 'تحديد الظاهر'}</button>
        <button type="button" className="btn" onClick={() => onChange([])}>مسح</button>
        <span className="muted-note">{value.length ? `${value.length} موظف محدد` : 'بدون تحديد = كل الموظفين'}</span>
      </div>
      <div className="picker-list">
        {shown.map((e) => (
          <label key={e.code} className="picker-item">
            <input type="checkbox" checked={value.includes(e.code)} onChange={() => toggle(e.code)} />
            {e.code} - {e.name}
          </label>
        ))}
        {!shown.length && <span className="muted">لا نتائج</span>}
      </div>
    </div>
  );
}

export default function Reports() {
  const [employees, setEmployees] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [emps, setEmps] = useState([]);
  const [tab, setTab] = useState('actual');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([api('/api/posting/setup'), api('/api/employees')])
      .then(([s, e]) => {
        setFrom(s.defaults.from);
        setTo(s.defaults.to);
        setEmployees(e);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setReady(true));
  }, []);

  async function run(which = tab, e) {
    e?.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const p = new URLSearchParams({ from, to });
      if (emps.length) p.set('emps', emps.join(','));
      setData(await api(`/api/posting/${which === 'actual' ? 'actual' : 'late-absent'}?${p}`));
    } catch (x) {
      setErr(x.message);
      setData(null);
    } finally {
      setBusy(false);
    }
  }

  const switchTab = (t) => {
    setTab(t);
    setData(null);
    if (from && to) run(t);
  };

  return (
    <>
      <form className="card" onSubmit={(e) => run(tab, e)}>
        <h2>التقارير</h2>
        <div className="grid">
          <label className="field"><span>من تاريخ</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="field"><span>إلى تاريخ</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <h3>الموظفين</h3>
        {ready ? <EmployeePicker employees={employees} value={emps} onChange={setEmps} /> : <Loading />}
        <div className="actions">
          <button className="btn" disabled={busy || !ready}>{busy && <span className="spinner" />}{busy ? 'جاري التحميل...' : 'عرض التقرير'}</button>
        </div>
        {err && <p className="note bad">{err}</p>}
      </form>

      <div className="tabs">
        <button type="button" className={tab === 'actual' ? 'on' : ''} onClick={() => switchTab('actual')}>المواعيد الفعلية</button>
        <button type="button" className={tab === 'late' ? 'on' : ''} onClick={() => switchTab('late')}>تقرير التأخيرات والغياب</button>
      </div>

      {busy && <section className="card"><Loading /></section>}

      {!busy && tab === 'actual' && data && (
        <section className="card table-wrap">
          <table>
            <thead><tr><th>الكود</th><th>الاسم</th><th>التاريخ</th><th>اليوم</th><th>الدوام</th><th>الحضور</th><th>الانصراف</th><th>التأخير (د)</th><th>الحالة</th></tr></thead>
            <tbody>
              {data.map((r) => (
                <tr key={`${r.code}-${r.date}`}>
                  <td>{r.code}</td><td>{r.name}</td><td>{r.date}</td><td>{r.dayName}</td>
                  <td dir="ltr">{r.shift ?? '-'}</td><td>{r.checkIn ?? '-'}</td><td>{r.checkOut ?? '-'}</td>
                  <td>{r.lateMinutes || '-'}</td><td className={cls[r.status]}>{r.status}</td>
                </tr>
              ))}
              {!data.length && <tr><td colSpan={9} className="muted">لا توجد مواعيد مرحّلة لهذه الفترة، رحّلها أولا من شاشة الترحيل</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      {!busy && tab === 'late' && data && (
        <section className="card table-wrap">
          <table>
            <thead><tr><th>الكود</th><th>الاسم</th><th>عدد التأخيرات</th><th>إجمالي دقائق التأخير</th><th>حتى 15 د</th><th>15–30 د</th><th>30 د – ساعتين</th><th>أكثر من ساعتين</th><th>أيام الخصم</th><th>عدد الغيابات</th></tr></thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.code}>
                  <td>{r.code}</td><td>{r.name}</td>
                  <td className="late">{r.lateCount}</td><td>{r.lateMinutes}</td><td>{r.upTo15}</td><td>{r.upTo30}</td><td>{r.upTo120}</td><td>{r.over120}</td>
                  <td><b>{r.deductionDays}</b></td><td className="absent">{r.absentCount}</td>
                </tr>
              ))}
              {!data.length && <tr><td colSpan={10} className="muted">لا توجد مواعيد مرحّلة لموظفين نشطين في هذه الفترة</td></tr>}
            </tbody>
          </table>
          <p className="muted-note">الخصم: كل 3 تأخيرات حتى 15 دقيقة = ربع يوم، تأخير 15–30 دقيقة = ربع يوم، من 30 دقيقة لساعتين = نصف يوم، أكثر من ساعتين = يوم. الغياب لا يدخل في أيام الخصم.</p>
        </section>
      )}
    </>
  );
}
