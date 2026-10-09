import { useEffect, useState } from 'react';
import { api, dayLabel } from '../api.js';
import Loading from '../Loading.jsx';
import { ActualTable, LateTable } from '../components/AttendanceTables.jsx';
import { Alert, Badge, Field, Icon, OptionPicker, PageHeader, Spinner, notify } from '../components/ui.jsx';

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
      const r = await api('/api/posting/post', { method: 'POST', body: f });
      setResult(r);
      notify(`تم ترحيل ${r.posted} موظف من ${r.employees}`);
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
      <PageHeader title="ترحيل المواعيد الفعلية" subtitle="تحويل البصمات الخام إلى مواعيد حضور وانصراف فعلية مع احتساب الإجازات والعطلات الرسمية" />

      <form className="card" onSubmit={post}>
        <div className="form-section">الفترة</div>
        <div className="grid two">
          <Field label="من تاريخ"><input type="date" value={f.from} onChange={set('from')} /></Field>
          <Field label="إلى تاريخ"><input type="date" value={f.to} onChange={set('to')} /></Field>
        </div>

        <div className="form-section">تحديد الموظفين <span className="muted">(اختياري)</span></div>
        <div className="grid">
          <div className="field">
            <span className="field-label">الإدارة</span>
            <OptionPicker options={setup?.depts ?? []} value={f.depts.map(String)} onChange={(v) => setF({ ...f, depts: v })} height={150} placeholder="بحث" />
          </div>
          <div className="field">
            <span className="field-label">الوظيفة</span>
            <OptionPicker options={setup?.jobs ?? []} value={f.jobs.map(String)} onChange={(v) => setF({ ...f, jobs: v })} height={150} placeholder="بحث" />
          </div>
          <div className="field">
            <span className="field-label">الموظف</span>
            <OptionPicker
              options={employees.map((x) => ({ id: x.code, name: `${x.code} - ${x.name}` }))}
              value={f.emps}
              onChange={(v) => setF({ ...f, emps: v })}
              height={150}
              placeholder="بحث بالاسم أو الكود"
            />
          </div>
        </div>
        <p className="muted-note">بدون اختيار إدارة أو وظيفة أو موظف يتم الترحيل لكل الموظفين. الترحيل يستبدل المواعيد المرحّلة سابقا لنفس الفترة.</p>

        <div className="form-actions">
          <button className="btn" disabled={busy}>{busy ? <Spinner /> : <Icon name="play" size={16} />}{busy ? 'جاري الترحيل...' : 'ترحيل المواعيد الفعلية'}</button>
          <button className="btn ghost" type="button" onClick={() => load()}>عرض بدون ترحيل</button>
        </div>
        {err && <Alert tone="danger">{err}</Alert>}
        {result && (
          <Alert tone={result.skipped.length ? 'warning' : 'success'}>
            تم ترحيل {result.posted} موظف من {result.employees}.
            {result.skipped.length > 0 && (
              <ul>
                {result.skipped.map((s) => <li key={s.id}>{s.id} - {names[s.id] ?? ''}: {s.reason}</li>)}
              </ul>
            )}
          </Alert>
        )}
      </form>

      {tab === 'actual' && emp && (
        <section className="card">
          <div className="card-title"><Icon name="users" />بيانات الموظف</div>
          <dl className="info-grid">
            <div><dt>الكود</dt><dd>{emp.code}</dd></div>
            <div><dt>الاسم</dt><dd>{emp.name}</dd></div>
            <div><dt>الوظيفة</dt><dd>{emp.job || '-'}</dd></div>
            <div><dt>الحالة</dt><dd><Badge tone="info">{emp.statusLabel}</Badge></dd></div>
            <div><dt>الهوية</dt><dd>{emp.nationalId || '-'}</dd></div>
            <div><dt>التعيين</dt><dd>{emp.hireDate ?? '-'}</dd></div>
            <div><dt>الدوام</dt><dd dir="ltr" style={{ textAlign: 'start' }}>{emp.shiftStart ? `${emp.shiftStart} - ${emp.shiftEnd}` : '-'}</dd></div>
            <div><dt>الإجازة الأسبوعية</dt><dd>{emp.weeklyOff.map(dayLabel).join('، ') || '-'}</dd></div>
          </dl>
        </section>
      )}

      <section className="card flush">
        <div className="tabs">
          <button type="button" className={tab === 'actual' ? 'on' : ''} onClick={() => switchTab('actual')}>المواعيد الفعلية</button>
          <button type="button" className={tab === 'late' ? 'on' : ''} onClick={() => switchTab('late')}>تقرير التأخيرات والغياب</button>
        </div>
        {loading && <Loading />}
        {!loading && tab === 'actual' && rows && <ActualTable rows={rows} emptyText="لا توجد مواعيد مرحّلة لهذه الفترة، اضغط ترحيل أولا" />}
        {!loading && tab === 'late' && summary && <LateTable rows={summary} />}
        {!loading && !((tab === 'actual' && rows) || (tab === 'late' && summary)) && (
          <p className="muted-note" style={{ padding: '0 16px 16px' }}>اضغط «ترحيل» أو «عرض بدون ترحيل» لعرض النتائج.</p>
        )}
      </section>
    </>
  );
}
