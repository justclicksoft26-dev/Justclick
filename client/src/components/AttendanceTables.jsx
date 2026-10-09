import { ATT_TONE } from '../api.js';
import { Badge, Empty } from './ui.jsx';

export function ActualTable({ rows, emptyText }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>الكود</th><th>الاسم</th><th>التاريخ</th><th>اليوم</th><th>الدوام</th><th>الحضور</th><th>الانصراف</th><th className="num">التأخير (د)</th><th>الحالة</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.code}-${r.date}`}>
              <td className="mono strong">{r.code}</td><td>{r.name}</td><td className="mono">{r.date}</td><td>{r.dayName}</td>
              <td dir="ltr" className="mono">{r.shift ?? '-'}</td><td className="mono">{r.checkIn ?? '-'}</td><td className="mono">{r.checkOut ?? '-'}</td>
              <td className="num">{r.lateMinutes || '-'}</td>
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
              <th>الكود</th><th>الاسم</th><th className="num">عدد التأخيرات</th><th className="num">إجمالي دقائق التأخير</th>
              <th className="num">حتى 15 د</th><th className="num">15–30 د</th><th className="num">30 د – ساعتين</th><th className="num">أكثر من ساعتين</th>
              <th className="num">أيام الخصم</th><th className="num">الغيابات</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code}>
                <td className="mono strong">{r.code}</td><td>{r.name}</td>
                <td className="num">{r.lateCount ? <Badge tone="warning">{r.lateCount}</Badge> : '-'}</td>
                <td className="num">{r.lateMinutes}</td><td className="num">{r.upTo15}</td><td className="num">{r.upTo30}</td><td className="num">{r.upTo120}</td><td className="num">{r.over120}</td>
                <td className="num strong">{r.deductionDays}</td>
                <td className="num">{r.absentCount ? <Badge tone="danger">{r.absentCount}</Badge> : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty icon="chart" title="لا توجد بيانات">لا توجد مواعيد مرحّلة لموظفين نشطين في هذه الفترة</Empty>}
      </div>
      <p className="muted-note" style={{ padding: '0 16px 16px' }}>
        الخصم: كل 3 تأخيرات حتى 15 دقيقة = ربع يوم، تأخير 15–30 دقيقة = ربع يوم، من 30 دقيقة لساعتين = نصف يوم، أكثر من ساعتين = يوم. الغياب لا يدخل في أيام الخصم.
      </p>
    </>
  );
}
