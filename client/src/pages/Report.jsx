import { useEffect, useMemo, useState } from 'react';
import { api, clampToday, norm, today } from '../api.js';
import Loading from '../Loading.jsx';
import { ActualTable, LATE_BANDS, LateTable, inBand } from '../components/AttendanceTables.jsx';
import { Alert, Icon, OptionPicker, PageHeader, Spinner, Stat } from '../components/ui.jsx';

const REPORTS = {
  actual: {
    title: 'تقرير المواعيد الفعلية',
    subtitle: 'حضور وانصراف كل موظف يوميا مقارنة بموعد الدوام',
    endpoint: 'actual',
    file: 'actual-times',
    columns: [['code', 'الكود'], ['name', 'الاسم'], ['branch', 'الفرع'], ['date', 'التاريخ'], ['dayName', 'اليوم'], ['shift', 'الدوام'], ['checkIn', 'الحضور'], ['checkOut', 'الانصراف'], ['lateMinutes', 'التأخير (د)'], ['penalty', 'الجزاء المستحق'], ['status', 'الحالة']],
  },
  lateOnly: {
    title: 'تقرير التأخيرات فقط',
    subtitle: 'الموظفون المتأخرون عن موعد الدوام في الفترة المحددة',
    endpoint: 'actual',
    file: 'late-only',
    pick: (r) => r.status === 'تأخير',
    columns: [['code', 'الكود'], ['name', 'الاسم'], ['branch', 'الفرع'], ['date', 'التاريخ'], ['dayName', 'اليوم'], ['shift', 'الدوام'], ['checkIn', 'الحضور'], ['lateMinutes', 'التأخير (د)'], ['penalty', 'الجزاء المستحق']],
  },
  late: {
    title: 'تقرير التأخيرات والغياب',
    subtitle: 'عدد التأخيرات والغيابات وأيام الخصم لكل موظف',
    endpoint: 'late-absent',
    file: 'late-absence',
    columns: [['code', 'الكود'], ['name', 'الاسم'], ['branch', 'الفرع'], ['lateCount', 'عدد التأخيرات'], ['lateMinutes', 'إجمالي دقائق التأخير'], ['tier1', '06:15–06:35'], ['tier2', '06:36–06:55'], ['tier3', '06:56–07:30'], ['over', 'بعد 07:30'], ['deductionDays', 'أيام الخصم'], ['penalty', 'الجزاء المستحق'], ['absentCount', 'الغيابات']],
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
  const [branches, setBranches] = useState([]);
  const [branch, setBranch] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [band, setBand] = useState('');
  // the filters of the last run: the late-report links carry these, not whatever is half-typed in the form
  const [applied, setApplied] = useState({ from: '', to: '', branch: '' });

  async function run(f = from, t = to, e = emps, b = branch, bd = band) {
    setErr('');
    setBusy(true);
    try {
      const p = new URLSearchParams({ from: f, to: t });
      if (e.length) p.set('emps', e.join(','));
      if (b) p.set('branches', b);
      const rows = await api(`/api/posting/${cfg.endpoint}?${p}`);
      setApplied({ from: f, to: t, branch: b });
      setData(cfg.pick ? rows.filter((r) => cfg.pick(r) && inBand(r.lateMinutes, bd)) : rows);
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
        // opened from a link (late report -> day list) the URL carries the filters; otherwise today, everyone
        const sp = new URLSearchParams(window.location.search);
        const r = { from: sp.get('from') || today(), to: sp.get('to') || today() };
        setRange(r);
        setEmployees(list);
        const bl = s.branches ?? [];
        setBranches(bl);
        setIsAdmin(!!s.isAdmin);
        // admin: all branches (changeable); branch user: their own branch is the only choice
        const def = bl.length === 1 && !s.isAdmin ? String(bl[0].id) : sp.get('branch') || '';
        const pickedEmps = (sp.get('emps') || '').split(',').filter(Boolean);
        const bd = LATE_BANDS.some((x) => x.key === sp.get('band')) ? sp.get('band') : '';
        setFrom(r.from);
        setTo(r.to);
        setEmps(pickedEmps);
        setShowEmps(false);
        setBranch(def);
        setBand(bd);
        return run(r.from, r.to, pickedEmps, def, bd);
      })
      .catch((x) => { setErr(x.message); setBusy(false); });
  }, [kind]);

  const shown = useMemo(() => {
    const n = norm(q.trim());
    return (data ?? []).filter((r) => !n || norm(`${r.code} ${r.name}`).includes(n));
  }, [data, q]);

  const stats = useMemo(() => {
    if (!data) return null;
    if (kind === 'lateOnly') {
      return [
        ['عدد التأخيرات', data.length, 'warning', 'clock'],
        ['موظفون متأخرون', new Set(data.map((r) => r.code)).size, 'primary', 'users'],
        ['إجمالي دقائق التأخير', data.reduce((a, r) => a + r.lateMinutes, 0), 'danger', 'alert'],
      ];
    }
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
          <input type="date" value={from} max={today()} onChange={(e) => setFrom(clampToday(e.target.value))} />
        </label>
        <label className="fb-field">
          <span>إلى</span>
          <input type="date" value={to} max={today()} onChange={(e) => setTo(clampToday(e.target.value))} />
        </label>
        {(isAdmin || branches.length > 0) && (
          <label className="fb-field">
            <span>الفرع</span>
            <select value={branch} onChange={(e) => setBranch(e.target.value)} disabled={!isAdmin && branches.length === 1}>
              {(isAdmin || branches.length > 1) && <option value="">كل الفروع</option>}
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
        <button type="button" className={`btn ghost${showEmps ? ' pressed' : ''}`} onClick={() => setShowEmps((v) => !v)} aria-expanded={showEmps}>
          <Icon name="users" size={16} />{emps.length ? `${emps.length} موظف محدد` : 'كل الموظفين'}
        </button>
        {band && (
          <button type="button" className="btn ghost pressed" onClick={() => { setBand(''); run(from, to, emps, branch, ''); }} title="إلغاء تصفية الفئة">
            {LATE_BANDS.find((x) => x.key === band)?.label} ✕
          </button>
        )}
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
        {!busy && data && kind === 'lateOnly' && <ActualTable rows={shown} emptyText="لا توجد تأخيرات في هذه الفترة" />}
        {!busy && data && kind === 'late' && (
          <LateTable
            rows={shown}
            link={(r, b) => `/reports/late-only?${new URLSearchParams({ from: applied.from, to: applied.to, emps: r.code, band: b, ...(applied.branch ? { branch: applied.branch } : {}) })}`}
          />
        )}
      </section>
    </>
  );
}
