// Report over the web check-in system (collections `employees` and `attendance_logs` in MongoDB, written by
// checkin/routes.js; connection in mongo.js).
import { getDb } from './mongo.js';

const TZ = 'Asia/Riyadh';
const WEEKEND = [5, 6]; // Friday, Saturday (JS getDay)
const DAY_CLOSE = 14 * 60; // 2:00 PM, after this the day is over

// ---- the regulation (minutes since midnight, Riyadh time) ----
//  07:30 - 07:45  start of the day (on time)
//  07:45 - 08:00  late: first quarter of a day
//  after 08:00    late: second, half a day
//  13:45 - 14:00  exit
//  no check-in and no check-out = absent
export const STATUS = {
  ON_TIME: 'في الموعد',
  LATE_QUARTER: 'تأخير أول ربع يوم',
  LATE_HALF: 'تأخير ثاني نصف يوم',
  ABSENT: 'غياب',
};
const START = 7 * 60 + 30;
const QUARTER_FROM = 7 * 60 + 45;
const HALF_FROM = 8 * 60;

export const toMinutes = (hhmm) => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Status of one day from the two punch times ("HH:MM" or null). */
export function classifyDay(checkIn, checkOut) {
  if (!checkIn && !checkOut) return { status: STATUS.ABSENT, note: 'لم يبصم حضور ولا انصراف' };
  let status;
  let note = '';
  if (!checkIn) {
    status = STATUS.ABSENT;
    note = 'بصمة انصراف بدون حضور';
  } else {
    const m = toMinutes(checkIn);
    status = m >= HALF_FROM ? STATUS.LATE_HALF : m >= QUARTER_FROM ? STATUS.LATE_QUARTER : STATUS.ON_TIME;
  }
  return { status, note };
}

// ---- time helpers ----
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const parts = (d) => Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
export const riyadhNow = (d = new Date()) => {
  const p = parts(d);
  const h = Number(p.hour) % 24;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${String(h).padStart(2, '0')}:${p.minute}`, minutes: h * 60 + Number(p.minute) };
};
const AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const dayOf = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const addDay = (iso) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);

/** Pure part: employees + logs -> report rows (now is injectable for tests). */
export function buildRows(employees, logs, from, to, now = riyadhNow()) {
  const byKey = new Map(); // "email|date" -> { in, out }
  for (const l of logs) {
    const k = `${l.email}|${l.date}`;
    const v = byKey.get(k) ?? {};
    v[l.type === 'check_in' ? 'in' : 'out'] = riyadhNow(l.recordedAt).time;
    byKey.set(k, v);
  }
  const rows = [];
  for (let date = from; date <= to; date = addDay(date)) {
    if (date > now.date) break; // future
    if (WEEKEND.includes(dayOf(date))) continue;
    const closed = date < now.date || now.minutes >= DAY_CLOSE; // today is still open until 2:00 PM
    for (const e of employees) {
      if (date < e.firstDate) continue; // not an employee yet
      const p = byKey.get(`${e.email}|${date}`) ?? {};
      if (!p.in && !p.out && !closed) continue; // today, nothing yet: not absent until the day ends
      const { status, note } = classifyDay(p.in, p.out);
      const missingOut = p.in && !p.out && closed ? 'لم يبصم الانصراف' : '';
      rows.push({
        email: e.email,
        name: e.name || e.email.split('@')[0],
        date,
        dayName: AR_DAYS[dayOf(date)],
        checkIn: p.in ?? null,
        checkOut: p.out ?? null,
        status,
        note: note || missingOut,
      });
    }
  }
  return rows.sort((a, b) => (a.date === b.date ? a.email.localeCompare(b.email) : a.date < b.date ? 1 : -1));
}

/** Rows of the report: one per registered employee per working day in [from, to]. */
export async function getWebAttendance(from, to, emails = []) {
  const d = await getDb();
  const empFilter = { active: { $ne: false }, ...(emails.length ? { email: { $in: emails } } : {}) };
  const employees = await d.collection('employees').find(empFilter).sort({ email: 1 }).toArray();
  const logs = await d.collection('attendance_logs')
    .find({ date: { $gte: from, $lte: to }, email: { $in: employees.map((e) => e.email) } })
    .toArray();
  return buildRows(employees, logs, from, to);
}
