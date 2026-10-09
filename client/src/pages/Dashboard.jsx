import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Loading from '../Loading.jsx';
import { api, ATT_TONE, norm } from '../api.js';
import { Alert, Badge, Empty, Icon, PageHeader, Stat } from '../components/ui.jsx';

const SEGMENTS = [
  ['present', 'حاضر', 'var(--success)'],
  ['late', 'متأخر', '#e0a100'],
  ['absent', 'غائب', 'var(--danger)'],
  ['leave', 'إجازة', 'var(--info)'],
  ['off', 'إجازة أسبوعية', '#9aa9bd'],
  ['other', 'أخرى', '#c9d3e0'],
];

const dayTotal = (t) => SEGMENTS.reduce((a, [k]) => a + t[k], 0);
const short = (d) => d.slice(5).replace('-', '/');

function Trend({ trend, current }) {
  const max = Math.max(1, ...trend.map(dayTotal));
  return (
    <div className="trend" role="img" aria-label="حضور آخر 14 يوم">
      {trend.map((t) => (
        <div key={t.date} className={`trend-col${t.date === current ? ' on' : ''}`} title={`${t.date}: حاضر ${t.present}، متأخر ${t.late}، غائب ${t.absent}`}>
          <div className="trend-bar" style={{ height: `${(dayTotal(t) / max) * 100}%` }}>
            {SEGMENTS.map(([k, , c]) => t[k] > 0 && <span key={k} style={{ flexGrow: t[k], background: c }} />)}
          </div>
          <small>{short(t.date)}</small>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [picked, setPicked] = useState('');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('');

  useEffect(() => {
    setData(null);
    api(`/api/dashboard${picked ? `?date=${picked}` : ''}`).then(setData).catch((e) => setErr(e.message));
  }, [picked]);

  const rows = useMemo(() => {
    const n = norm(q.trim());
    return (data?.rows ?? []).filter((r) => (!filter || r.status === filter) && (!n || norm(`${r.code} ${r.name} ${r.job}`).includes(n)));
  }, [data, q, filter]);

  if (err) return <Alert tone="danger">{err}</Alert>;
  if (!data) return <Loading />;

  const s = data.summary;
  const dayLabel = data.date ? `${data.dayName} ${data.date}` : '';

  return (
    <>
      <PageHeader title="لوحة المتابعة" subtitle={data.date ? `مواعيد حضور وانصراف الموظفين — ${dayLabel}` : 'مواعيد حضور وانصراف الموظفين'}>
        {data.date && (
          <label className="fb-field inline">
            <span>اليوم</span>
            <input type="date" value={data.date} min={data.minDate} max={data.maxDate} onChange={(e) => e.target.value && setPicked(e.target.value)} />
          </label>
        )}
      </PageHeader>

      {!data.date ? (
        <section className="card">
          <Empty icon="clock" title="لا توجد مواعيد مرحّلة بعد">
            ابدأ بسحب البصمات ثم <Link to="/posting">ترحيل المواعيد الفعلية</Link> لتظهر لوحة المتابعة.
          </Empty>
        </section>
      ) : (
        <>
          <div className="stats">
            <Stat label="إجمالي الموظفين المرحّلين" value={s.total} icon="users" />
            <Stat label="حاضر" value={s.present} tone="success" icon="check" />
            <Stat label="متأخر" value={s.late} tone="warning" icon="clock" />
            <Stat label="غائب" value={s.absent} tone="danger" icon="alert" />
            <Stat label="إجازات" value={s.leave + s.off} tone="info" icon="calendar" />
          </div>

          <div className="grid two dash-row">
            <section className="card">
              <div className="card-title"><Icon name="chart" />حضور آخر 14 يوم</div>
              <Trend trend={data.trend} current={data.date} />
              <div className="legend">
                {SEGMENTS.map(([k, label, c]) => <span key={k}><i style={{ background: c }} />{label}</span>)}
              </div>
            </section>
            <section className="card">
              <div className="card-title"><Icon name="info" />توزيع الحالات — {data.date}</div>
              {s.total === 0 ? <p className="muted">لا توجد سجلات في هذا اليوم.</p> : (
                <div className="dist">
                  {SEGMENTS.filter(([k]) => s[k] > 0).map(([k, label, c]) => (
                    <div key={k} className="dist-row">
                      <span>{label}</span>
                      <div className="dist-track"><div style={{ width: `${(s[k] / s.total) * 100}%`, background: c }} /></div>
                      <b>{s[k]}</b>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="card flush">
            <div className="toolbar">
              <strong className="toolbar-title">مواعيد الموظفين</strong>
              <div className="search">
                <Icon name="search" size={16} />
                <input placeholder="بحث بالاسم أو الكود..." value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="تصفية بالحالة">
                <option value="">كل الحالات</option>
                {[...new Set(data.rows.map((r) => r.status))].map((st) => <option key={st} value={st}>{st}</option>)}
              </select>
              <span className="result-count">{rows.length} موظف</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>الكود</th><th>الاسم</th><th>الوظيفة</th><th>الدوام</th><th>الحضور</th><th>الانصراف</th><th className="num">التأخير (د)</th><th>الحالة</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.code}>
                      <td className="mono strong">{r.code}</td>
                      <td className="strong"><Link className="row-link" to={`/employees/${r.code}`}>{r.name}</Link></td>
                      <td>{r.job || '-'}</td>
                      <td dir="ltr" className="mono">{r.shift ?? '-'}</td>
                      <td className="mono">{r.checkIn ?? '-'}</td>
                      <td className="mono">{r.checkOut ?? '-'}</td>
                      <td className="num">{r.lateMinutes || '-'}</td>
                      <td><Badge tone={ATT_TONE[r.status] ?? 'info'}>{r.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length && <Empty icon="search" title="لا توجد نتائج" />}
            </div>
          </section>
        </>
      )}
    </>
  );
}
