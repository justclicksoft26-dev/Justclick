import { Link } from 'react-router-dom';
import { ATT_TONE } from '../api.js';
import { Badge, Empty } from './ui.jsx';

export const LATE_BANDS = [
  { key: 'b15', label: 'حتى 15 د', min: 0, max: 15 },
  { key: 'b30', label: '15–30 د', min: 15, max: 30 },
  { key: 'b120', label: '30 د – ساعتين', min: 30, max: 120 },
  { key: 'bOver', label: 'أكثر من ساعتين', min: 120, max: Infinity },
];
export const inBand = (minutes, key) => {
  const b = LATE_BANDS.find((x) => x.key === key);
  return !b || (minutes > b.min && minutes <= b.max);
};

export function ActualTable({ rows, emptyText }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>الكود</th><th>الاسم</th><th>الفرع</th><th>التاريخ</th><th>اليوم</th><th>الدوام</th><th>الحضور</th><th>الانصراف</th><th className="num">التأخير (د)</th><th>الجزاء المستحق</th><th>الحالة</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.code}-${r.date}`}>
              <td className="mono strong">{r.code}</td><td>{r.name}</td><td>{r.branch || '-'}</td><td className="mono">{r.date}</td><td>{r.dayName}</td>
              <td dir="ltr" className="mono">{r.shift ?? '-'}</td><td className="mono">{r.checkIn ?? '-'}</td><td className="mono">{r.checkOut ?? '-'}</td>
              <td className="num">{r.lateMinutes || '-'}</td>
              <td className="strong">{r.penalty}</td>
              <td><Badge tone={ATT_TONE[r.status] ?? 'info'}>{r.status}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <Empty icon="clock" title="لا توجد مواعيد مرحّلة">{emptyText}</Empty>}
    </div>
  );
}

/** `link(row, bandKey)` builds the URL of the day-by-day report for that employee and band. */
export function LateTable({ rows, link }) {
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>الكود</th><th>الاسم</th><th>الفرع</th><th className="num">عدد التأخيرات</th><th className="num">إجمالي دقائق التأخير</th>
              {LATE_BANDS.map((b) => <th key={b.key} className="num">{b.label}</th>)}
              <th className="num">أيام الخصم</th><th>الجزاء المستحق</th><th className="num">الغيابات</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code}>
                <td className="mono strong">{r.code}</td><td>{r.name}</td><td>{r.branch || '-'}</td>
                <td className="num">{r.lateCount ? <Badge tone="warning">{r.lateCount}</Badge> : '-'}</td>
                <td className="num">{r.lateMinutes}</td>
                {LATE_BANDS.map((b) => (
                  <td key={b.key} className="num">
                    {r[b.key] ? (link ? <Link className="count-link" to={link(r, b.key)} title="عرض أيام التأخير">{r[b.key]}</Link> : r[b.key]) : '-'}
                  </td>
                ))}
                <td className="num strong">{r.deductionDays}</td><td className="strong">{r.penalty}</td>
                <td className="num">{r.absentCount ? <Badge tone="danger">{r.absentCount}</Badge> : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty icon="chart" title="لا توجد بيانات">لا توجد مواعيد مرحّلة لموظفين نشطين في هذه الفترة</Empty>}
      </div>
      <p className="muted-note" style={{ padding: '0 16px 16px' }}>
        لائحة التأخير: من 06:15 إلى 06:35 كل 3 مرات = نصف يوم، من 06:36 إلى 06:55 المرة = ربع يوم، من 06:56 إلى 07:30 المرة = نصف يوم، وبعد 07:30 = يوم كامل. الغياب لا يدخل في أيام الخصم.
      </p>
    </>
  );
}
