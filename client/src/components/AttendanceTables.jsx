import { ATT_TONE } from '../api.js';
import { Badge, Empty } from './ui.jsx';

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

export function LateTable({ rows }) {
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>الكود</th><th>الاسم</th><th>الفرع</th><th className="num">عدد التأخيرات</th><th className="num">إجمالي دقائق التأخير</th>
              <th className="num">06:15–06:35</th><th className="num">06:36–06:55</th><th className="num">06:56–07:30</th><th className="num">بعد 07:30</th>
              <th className="num">أيام الخصم</th><th>الجزاء المستحق</th><th className="num">الغيابات</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code}>
                <td className="mono strong">{r.code}</td><td>{r.name}</td><td>{r.branch || '-'}</td>
                <td className="num">{r.lateCount ? <Badge tone="warning">{r.lateCount}</Badge> : '-'}</td>
                <td className="num">{r.lateMinutes}</td><td className="num">{r.tier1}</td><td className="num">{r.tier2}</td><td className="num">{r.tier3}</td><td className="num">{r.over}</td>
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
