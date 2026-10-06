import { toMinutes } from './validation.js';

export const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function* eachDate(from, to) {
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) yield d.toISOString().slice(0, 10);
}

const covering = (ranges, date) => ranges.find((r) => r.from <= date && date <= r.to);

/**
 * emp:     { hireDate|null, endDate|null, graceMin, weeklyOff:number[] (0=Sunday),
 *            shifts:[{from,to,start,end}], holidays:[{from,to}], vacations:[{from,to}] }
 * punches: Map<'YYYY-MM-DD', { first:'HH:MM', last:'HH:MM', count }>
 * now:     { date:'YYYY-MM-DD', minutes }
 *
 * Rules: first punch = in, last = out (a single punch -> no out). Late when in > shift start + grace,
 * measured from the shift start; only evaluated on working days that have a shift.
 * Absent = working day (not weekly off / official holiday / vacation) with no punch.
 * Nothing counts before the hire date, after the end of service, or after today; today is
 * absent only once the shift ended.
 */
export function analyzeEmployee(emp, punches, from, to, now) {
  const days = [];
  const summary = { lateCount: 0, lateMinutes: 0, absentCount: 0 };
  let first = emp.hireDate && emp.hireDate > from ? emp.hireDate : from;
  let last = to > now.date ? now.date : to;
  if (emp.endDate && emp.endDate < last) last = emp.endDate;
  if (first > last) return { days, summary };

  for (const date of eachDate(first, last)) {
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    const isOff = emp.weeklyOff.includes(dow);
    const holiday = covering(emp.holidays, date);
    const vacation = covering(emp.vacations, date);
    const shift = covering(emp.shifts, date);
    const p = punches.get(date);
    const row = { date, dayName: DAY_NAMES[dow], checkIn: null, checkOut: null, lateMinutes: 0, status: '' };
    const restLabel = isOff ? 'إجازة أسبوعية' : holiday ? 'عطلة رسمية' : vacation ? 'إجازة' : null;

    if (p) {
      row.checkIn = p.first;
      row.checkOut = p.count > 1 ? p.last : 'بدون انصراف';
      if (restLabel) {
        row.status = restLabel;
      } else if (shift && toMinutes(p.first) > shift.start + emp.graceMin) {
        row.lateMinutes = toMinutes(p.first) - shift.start;
        row.status = 'تأخير';
        summary.lateCount++;
        summary.lateMinutes += row.lateMinutes;
      } else {
        row.status = 'حاضر';
      }
    } else if (isOff) {
      continue;
    } else if (restLabel) {
      row.status = restLabel;
    } else if (date === now.date && (!shift || now.minutes <= shift.end)) {
      continue;
    } else {
      row.status = 'غائب';
      summary.absentCount++;
    }
    days.push(row);
  }
  return { days, summary };
}
