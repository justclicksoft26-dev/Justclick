import { useEffect, useMemo, useState } from 'react';
import { api, norm } from '../api.js';
import Loading from '../Loading.jsx';
import { ActualTable, LateTable } from '../components/AttendanceTables.jsx';
import { Alert, Icon, OptionPicker, PageHeader, Spinner, Stat } from '../components/ui.jsx';

const REPORTS = {
  actual: {
    title: 'تقرير المواعيد الفعلية',
    subtitle: 'حضور وانصراف كل موظف يوميا مقارنة بموعد الدوام',
    endpoint: 'actual',
    file: 'actual-times',
    columns: [['code', 'الكود'], ['name', 'الاسم'], ['date', 'التاريخ'], ['dayName', 'اليوم'], ['shift', 'الدوام'], ['checkIn', 'الحضور'], ['checkOut', 'الانصراف'], ['lateMinutes', 'التأخير (د)'], ['status', 'الحالة']],
  },
  late: {
    title: 'تقرير التأخيرات والغياب',
    subtitle: 'عدد التأخيرات والغيابات وأيام الخصم لكل موظف',
    endpoint: 'late-absent',
    file: 'late-absence',
    columns: [['code', 'الكود'], ['name', 'الاسم'], ['lateCount', 'عدد التأخيرات'], ['lateMinutes', 'إجمالي دقائق التأخير'], ['upTo15', 'حتى 15 د'], ['upTo30', '15-30 د'], ['upTo120', '30 د - ساعتين'], ['over120', 'أكثر من ساعتين'], ['deductionDays', 'أيام الخصم'], ['absentCount', 'الغيابات']],
  },
};

function downloadCsv(cfg, rows, from, to) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [cfg.columns.map(([, h]) => esc(h)).join(',')];
  for (const r of rows) lines.push(cfg.columns.map(([k]) => esc(r[k])).join(','));
  const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${cfg.file}_${from}_${to}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function Report({ kind }) {
  const cfg = REPORTS[kind];
  const [employees, setEmployees] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [emps, setEmps] = useState([]);
  const [showEmps, setShowEmps] = useState(false);
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(true);
  const [range, setRange] = useState(null);

  async function run(f = from, t = to, e = emps) {
    setErr('');
    setBusy(true);
    try {
      const p = new URLSearchParams({ from: f, to: t });
      if (e.length) p.set('emps', e.join(','));
      setData(await api(`/api/posting/${cfg.endpoint}?${p}`));
    } catch (x) {
      setErr(x.message);
      setData(null);
    } finally {
      setBusy(false);
    }
  }

  // defaults: all employees, dates where posted data exists
  useEffect(() => {
    setData(null);
    setQ('');
    Promise.all([api('/api/posting/setup'), api('/api/employees')])
      .then(([s, list]) => {
        const r = s.reportRange ?? { from: s.defaults.from, to: s.defaults.to, min: s.defaults.from, max: s.defaults.to };
        setRange(r);
        setEmployees(list);
        setFrom(r.from);
        setTo(r.to);
        setEmps([]);
        return run(r.from, r.to, []);
      })
      .catch((x) => { setErr(x.message); setBusy(false); });
  }, [kind]);

  const shown = useMemo(() => {
    const n = norm(q.trim());
    return (data ?? []).filter((r) => !n || norm(`${r.code} ${r.name}`).includes(n));
  }, [data, q]);

  const stats = useMemo(() => {
    if (!data) return null;
    if (kind === 'actual') {
      return [
        ['السجلات', data.length, 'primary', 'file'],
        ['حاضر', data.filter((r) => r.status === 'حاضر').length, 'success', 'check'],
        ['تأخير', data.filter((r) => r.status === 'تأخير').length, 'warning', 'clock'],
        ['غياب', data.filter((r) => r.status === 'غائب').length, 'danger', 'alert'],
      ];
    }
    return [
      ['الموظفين', data.length, 'primary', 'users'],
      ['إجمالي التأخيرات', data.reduce((a, r) => a + r.lateCount, 0), 'warning', 'clock'],
      ['إجمالي الغيابات', data.reduce((a, r) => a + r.absentCount, 0), 'danger', 'alert'],
      ['أيام الخصم', data.reduce((a, r) => a + r.deductionDays, 0), 'info', 'chart'],
    ];
  }, [data, kind]);

  const submit = (e) => {
    e.preventDefault();
    run();
  };

  return (
    <>
      <PageHeader title={cfg.title} subtitle={cfg.subtitle}>
        <button className="btn ghost" type="button" disabled={!shown.length} onClick={() => downloadCsv(cfg, shown, from, to)}>
          <Icon name="download" size={16} />تصدير Excel / CSV
        </button>
      </PageHeader>

      <form className="filterbar" onSubmit={submit}>
        <label className="fb-field">
          <span>من</span>
          <input type="date" value={from} min={range?.min} max={range?.max} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="fb-field">
          <span>إلى</span>
          <input type="date" value={to} min={range?.min} max={range?.max} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="button" className={`btn ghost${showEmps ? ' pressed' : ''}`} onClick={() => setShowEmps((v) => !v)} aria-expanded={showEmps}>
          <Icon name="users" size={16} />{emps.length ? `${emps.length} موظف محدد` : 'كل الموظفين'}
        </button>
        <button className="btn" disabled={busy || !from || !to}>{busy ? <Spinner /> : <Icon name="search" size={16} />}عرض</button>
      </form>

      {showEmps && (
        <section className="card" style={{ marginTop: -8 }}>
          <OptionPicker
            options={employees.map((x) => ({ id: x.code, name: `${x.code} - ${x.name}` }))}
            value={emps}
            onChange={setEmps}
            placeholder="بحث بالاسم أو الكود"
            emptyHint="بدون تحديد = كل الموظفين"
            height={170}
          />
          <p className="muted-note">اختر الموظفين ثم اضغط «عرض» لتطبيق التحديد.</p>
        </section>
      )}

      {err && <Alert tone="danger">{err}</Alert>}

      {stats && (
        <div className="stats compact">
          {stats.map(([label, value, tone, icon]) => <Stat key={label} label={label} value={value} tone={tone} icon={icon} />)}
        </div>
      )}

      <section className="card flush">
        <div className="toolbar">
          <div className="search">
            <Icon name="search" size={16} />
            <input placeholder="بحث في النتائج بالاسم أو الكود..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {data && <span className="result-count">{shown.length} نتيجة</span>}
        </div>
        {busy && <Loading />}
        {!busy && data && kind === 'actual' && <ActualTable rows={shown} emptyText="لا توجد مواعيد مرحّلة لهذه الفترة، رحّلها أولا من شاشة الترحيل" />}
        {!busy && data && kind === 'late' && <LateTable rows={shown} />}
      </section>
    </>
  );
}
