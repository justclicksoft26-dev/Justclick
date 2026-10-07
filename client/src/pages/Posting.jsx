import { useEffect, useState } from 'react';
import { api, dayLabel } from '../api.js';
import Loading from '../Loading.jsx';

const cls = { 'تأخير': 'late', 'غائب': 'absent', 'حاضر': 'ok' };
const picked = (e) => [...e.target.selectedOptions].map((o) => o.value);

function MultiSelect({ label, options, value, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select multiple size={4} value={value} onChange={(e) => onChange(picked(e))}>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
}

const qs = (f) => {
  const p = new URLSearchParams({ from: f.from, to: f.to });
  for (const k of ['depts', 'jobs', 'emps']) if (f[k].length) p.set(k, f[k].join(','));
  return p.toString();
};

export default function Posting() {
  const [setup, setSetup] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [f, setF] = useState({ from: '', to: '', depts: [], jobs: [], emps: [] });
  const [tab, setTab] = useState('actual');
  const [rows, setRows] = useState(null);
  const [summary, setSummary] = useState(null);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([api('/api/posting/setup'), api('/api/employees')])
      .then(([s, e]) => {
        setSetup(s);
        setEmployees(e);
        setF((x) => ({ ...x, from: s.defaults.from, to: s.defaults.to }));
      })
      .catch((e) => setErr(e.message));
  }, []);

  const names = Object.fromEntries(employees.map((e) => [e.code, e.name]));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function load(which = tab) {
    setErr('');
    setLoading(true);
    try {
      if (which === 'actual') setRows(await api(`/api/posting/actual?${qs(f)}`));
      else setSummary(await api(`/api/posting/late-absent?${qs(f)}`));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function post(e) {
    e.preventDefault();
    setErr('');
    setResult(null);
    setBusy(true);
    try {
      setResult(await api('/api/posting/post', { method: 'POST', body: f }));
      await load();
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  }

  const switchTab = (t) => {
    setTab(t);
    load(t);
  };

  const emp = f.emps.length === 1 ? employees.find((x) => x.code === f.emps[0]) : null;

  return (
    <>
      <form className="card" onSubmit={post}>
        <h2>ترحيل المواعيد الفعلية</h2>
        <div className="grid">
          <label className="field"><span>من تاريخ</span><input type="date" value={f.from} onChange={set('from')} /></label>
          <label className="field"><span>إلى تاريخ</span><input type="date" value={f.to} onChange={set('to')} /></label>
          <MultiSelect label="الإدارة" options={setup?.depts ?? []} value={f.depts} onChange={(v) => setF({ ...f, depts: v })} />
          <MultiSelect label="الوظيفة" options={setup?.jobs ?? []} value={f.jobs} onChange={(v) => setF({ ...f, jobs: v })} />
          <MultiSelect
            label="الموظف"
            options={employees.map((x) => ({ id: x.code, name: `${x.code} - ${x.name}` }))}
            value={f.emps}
            onChange={(v) => setF({ ...f, emps: v })}
          />
        </div>
        <p className="muted-note">بدون اختيار إدارة أو وظيفة أو موظف يتم الترحيل لكل الموظفين. الترحيل يستبدل المواعيد المرحّلة سابقا لنفس الفترة.</p>
        <div className="actions">
          <button className="btn" disabled={busy}>{busy && <span className="spinner" />}{busy ? 'جاري الترحيل...' : 'ترحيل المواعيد الفعلية'}</button>
          <button className="btn" type="button" onClick={() => load()}>عرض بدون ترحيل</button>
        </div>
        {err && <p className="note bad">{err}</p>}
        {result && (
          <div className="note ok">
            تم ترحيل {result.posted} موظف من {result.employees}.
            {result.skipped.length > 0 && (
              <ul className="skipped">
                {result.skipped.map((s) => <li key={s.id}>{s.id} - {names[s.id] ?? ''}: {s.reason}</li>)}
              </ul>
            )}
          </div>
        )}
      </form>

      <div className="tabs">
        <button type="button" className={tab === 'actual' ? 'on' : ''} onClick={() => switchTab('actual')}>المواعيد الفعلية</button>
        <button type="button" className={tab === 'late' ? 'on' : ''} onClick={() => switchTab('late')}>تقرير التأخيرات والغياب</button>
      </div>

      {tab === 'actual' && emp && (
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
      )}

      {loading && <section className="card"><Loading /></section>}

      {!loading && tab === 'actual' && rows && (
        <section className="card table-wrap">
          <table>
            <thead><tr><th>الكود</th><th>الاسم</th><th>التاريخ</th><th>اليوم</th><th>الدوام</th><th>الحضور</th><th>الانصراف</th><th>التأخير (د)</th><th>الحالة</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.code}-${r.date}`}>
                  <td>{r.code}</td><td>{r.name}</td><td>{r.date}</td><td>{r.dayName}</td>
                  <td dir="ltr">{r.shift ?? '-'}</td><td>{r.checkIn ?? '-'}</td><td>{r.checkOut ?? '-'}</td>
                  <td>{r.lateMinutes || '-'}</td><td className={cls[r.status]}>{r.status}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={9} className="muted">لا توجد مواعيد مرحّلة لهذه الفترة، اضغط ترحيل أولا</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      {!loading && tab === 'late' && summary && (
        <section className="card table-wrap">
          <table>
            <thead><tr><th>الكود</th><th>الاسم</th><th>عدد التأخيرات</th><th>إجمالي دقائق التأخير</th><th>حتى 15 د</th><th>15–30 د</th><th>30 د – ساعتين</th><th>أكثر من ساعتين</th><th>أيام الخصم</th><th>عدد الغيابات</th></tr></thead>
            <tbody>
              {summary.map((r) => (
                <tr key={r.code}>
                  <td>{r.code}</td><td>{r.name}</td>
                  <td className="late">{r.lateCount}</td><td>{r.lateMinutes}</td><td>{r.upTo15}</td><td>{r.upTo30}</td><td>{r.upTo120}</td><td>{r.over120}</td><td><b>{r.deductionDays}</b></td><td className="absent">{r.absentCount}</td>
                </tr>
              ))}
              {!summary.length && <tr><td colSpan={10} className="muted">لا توجد مواعيد مرحّلة لموظفين نشطين في هذه الفترة</td></tr>}
            </tbody>
          </table>
          <p className="muted-note">الخصم: كل 3 تأخيرات حتى 15 دقيقة = ربع يوم، تأخير 15–30 دقيقة = ربع يوم، من 30 دقيقة لساعتين = نصف يوم، أكثر من ساعتين = يوم. الغياب لا يدخل في أيام الخصم.</p>
        </section>
      )}
    </>
  );
}
