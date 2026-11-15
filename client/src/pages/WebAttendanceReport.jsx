import { useEffect, useMemo, useState } from 'react';
import { api, clampToday, norm, today } from '../api.js';
import Loading from '../Loading.jsx';
import { Alert, Badge, Empty, Icon, PageHeader, Spinner, Stat } from '../components/ui.jsx';

const ON_TIME = 'في الموعد';
const LATE_QUARTER = 'تأخير أول ربع يوم';
const LATE_HALF = 'تأخير ثاني نصف يوم';
const ABSENT = 'غياب';
const TONE = { [ON_TIME]: 'success', [LATE_QUARTER]: 'warning', [LATE_HALF]: 'danger', [ABSENT]: 'danger' };

const COLUMNS = [['email', 'الإيميل'], ['name', 'الاسم'], ['date', 'التاريخ'], ['dayName', 'اليوم'], ['checkIn', 'الحضور'], ['checkOut', 'الانصراف'], ['status', 'الحالة'], ['note', 'ملاحظة']];

function downloadCsv(rows, from, to) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [COLUMNS.map(([, h]) => esc(h)).join(',')];
  for (const r of rows) lines.push(COLUMNS.map(([k]) => esc(r[k])).join(','));
  const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `web-attendance_${from}_${to}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function WebAttendanceReport() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [applied, setApplied] = useState({ from: '', to: '' });
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(true);

  async function run(f = from, t = to) {
    setErr('');
    setBusy(true);
    try {
      setData(await api(`/api/web-attendance/report?${new URLSearchParams({ from: f, to: t })}`));
      setApplied({ from: f, to: t });
    } catch (x) {
      setErr(x.message);
      setData(null);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { run(); }, []);

  const shown = useMemo(() => {
    const n = norm(q.trim());
    return (data ?? []).filter((r) => (!status || r.status === status) && (!n || norm(`${r.email} ${r.name}`).includes(n)));
  }, [data, q, status]);

  const count = (s) => (data ?? []).filter((r) => r.status === s).length;

  return (
    <>
      <PageHeader title="تقرير الحضور الإلكتروني" subtitle="حضور وانصراف الموظفين من النظام الإلكتروني حسب لائحة الدوام">
        <button className="btn ghost" type="button" disabled={!shown.length} onClick={() => window.print()}>
          <Icon name="print" size={16} />طباعة
        </button>
        <button className="btn ghost" type="button" disabled={!shown.length} onClick={() => downloadCsv(shown, applied.from, applied.to)}>
          <Icon name="download" size={16} />تصدير Excel / CSV
        </button>
      </PageHeader>

      <div className="print-only print-meta">
        <strong>تقرير الحضور الإلكتروني</strong>
        <span>من {applied.from} إلى {applied.to}</span>
      </div>

      <form className="filterbar" onSubmit={(e) => { e.preventDefault(); run(); }}>
        <label className="fb-field">
          <span>من</span>
          <input type="date" value={from} max={today()} onChange={(e) => setFrom(clampToday(e.target.value))} />
        </label>
        <label className="fb-field">
          <span>إلى</span>
          <input type="date" value={to} max={today()} onChange={(e) => setTo(clampToday(e.target.value))} />
        </label>
        <label className="fb-field">
          <span>الحالة</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">كل الحالات</option>
            {[ON_TIME, LATE_QUARTER, LATE_HALF, ABSENT].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <button className="btn" disabled={busy || !from || !to}>{busy ? <Spinner /> : <Icon name="search" size={16} />}عرض</button>
      </form>

      {err && <Alert tone="danger">{err}</Alert>}

      {data && (
        <div className="stats compact">
          <Stat label="في الموعد" value={count(ON_TIME)} tone="success" icon="check" />
          <Stat label="تأخير أول ربع يوم" value={count(LATE_QUARTER)} tone="warning" icon="clock" />
          <Stat label="تأخير ثاني نصف يوم" value={count(LATE_HALF)} tone="info" icon="clock" />
          <Stat label="غياب" value={count(ABSENT)} tone="danger" icon="alert" />
        </div>
      )}

      <section className="card flush">
        <div className="toolbar">
          <div className="search">
            <Icon name="search" size={16} />
            <input placeholder="بحث بالاسم أو الإيميل..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {data && <span className="result-count">{shown.length} نتيجة</span>}
        </div>
        {busy && <Loading />}
        {!busy && data && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>الإيميل</th><th>الاسم</th><th>التاريخ</th><th>اليوم</th><th>الحضور</th><th>الانصراف</th><th>الحالة</th><th>ملاحظة</th></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={`${r.email}-${r.date}`}>
                    <td className="mono">{r.email}</td><td className="strong">{r.name}</td><td className="mono">{r.date}</td><td>{r.dayName}</td>
                    <td className="mono">{r.checkIn ?? '-'}</td><td className="mono">{r.checkOut ?? '-'}</td>
                    <td><Badge tone={TONE[r.status] ?? 'neutral'}>{r.status}</Badge></td>
                    <td>{r.note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!shown.length && <Empty icon="clock" title="لا توجد سجلات">لا توجد سجلات حضور إلكتروني لهذه الفترة</Empty>}
          </div>
        )}
        <p className="muted-note" style={{ padding: '0 16px 16px' }}>
          اللائحة: من 7:30 إلى 7:45 بداية الدوام، من 7:45 إلى 8:00 تأخير أول ربع يوم، بعد 8:00 تأخير ثاني نصف يوم، من 1:45 إلى 2:00 الخروج.
          من لم يبصم حضورًا ولا انصرافًا في يوم عمل يُعتبر غائبًا (الجمعة والسبت إجازة، واليوم الحالي لا يُحسب غيابًا قبل 2:00 ظهرًا).
        </p>
      </section>
    </>
  );
}
