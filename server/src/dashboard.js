import { query } from './db.js';
import { describe } from './posting.js';

const ymd = (c) => `TO_CHAR(${c},'YYYY-MM-DD')`;
const hhmm = (c) => `TO_CHAR(${c},'HH24:MI')`;
const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const addDays = (s, n) => {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const bucket = (status) => ({
  'حاضر': 'present', 'تأخير': 'late', 'غائب': 'absent', 'إجازة أسبوعية': 'off', 'إجازة': 'leave',
}[status] ?? 'other');

const tally = () => ({ present: 0, late: 0, absent: 0, off: 0, leave: 0, other: 0 });

async function postedRows(from, to) {
  const { rows } = await query(
    `SELECT x.EMP_ID, TRIM(e.EMP_NAME_AR) NAME, TRIM(j.LOOK_UP_NAME_AR) JOB, ${ymd('x.FROM_IO_DATE')} D,
            ${hhmm('x.IN_TIME')} IN_T, ${hhmm('x.OUT_TIME')} OUT_T, x.IN_FLAG, x.OUT_FLAG,
            ${hhmm('x.SHIFT_DATE_FROM')} SHIFT_F, ${hhmm('x.SHIFT_DATE_TO')} SHIFT_T, NVL(g.GRACE_MIN, 0) GRACE
       FROM EMP_IO_TIMES x JOIN EMPLOYEES e ON e.EMP_ID = x.EMP_ID
       LEFT JOIN LOOK_UP j ON j.PARENT_ID = 12 AND j.LOOK_UP_ID = e.JOB_CODE
       LEFT JOIN ATTM_EMP_SETTING g ON g.EMP_ID = x.EMP_ID
      WHERE x.FROM_IO_DATE BETWEEN TO_DATE(:f,'YYYY-MM-DD') AND TO_DATE(:t,'YYYY-MM-DD')
        AND e.EMP_ACTIVE = 'Y' AND NVL(e.END_SERVICE_FLG, 'N') <> 'Y'
      ORDER BY x.FROM_IO_DATE, e.EMP_NAME_AR`,
    { f: from, t: to },
  );
  return rows.map((r) => {
    const d = describe(r, r.GRACE);
    return {
      code: String(r.EMP_ID), name: r.NAME, job: r.JOB ?? '', date: r.D, shift: r.SHIFT_F ? `${r.SHIFT_F} - ${r.SHIFT_T}` : null,
      checkIn: r.IN_T, checkOut: r.OUT_T, lateMinutes: d.lateMinutes, status: d.status,
    };
  });
}

/** Attendance picture of one day (default: newest posted day) plus a 14-day trend. */
export async function getDashboard(date) {
  const range = (await query(
    `SELECT ${ymd('MIN(FROM_IO_DATE)')} MN, ${ymd('MAX(CASE WHEN FROM_IO_DATE <= TRUNC(SYSDATE) THEN FROM_IO_DATE END)')} MX FROM EMP_IO_TIMES`,
  )).rows[0];
  if (!range?.MX) return { date: null, minDate: null, maxDate: null, summary: null, rows: [], trend: [] };

  const day = date || range.MX;
  const trendFrom = addDays(day, -13);
  const all = await postedRows(trendFrom, day);

  const rows = all.filter((r) => r.date === day);
  const summary = { total: rows.length, ...tally() };
  for (const r of rows) summary[bucket(r.status)]++;

  const byDay = new Map();
  for (const r of all) {
    const t = byDay.get(r.date) ?? { date: r.date, ...tally() };
    t[bucket(r.status)]++;
    byDay.set(r.date, t);
  }
  const trend = [...byDay.values()].map((t) => ({ ...t, dayName: DAY_NAMES[new Date(`${t.date}T00:00:00Z`).getUTCDay()] }));

  return {
    date: day, dayName: DAY_NAMES[new Date(`${day}T00:00:00Z`).getUTCDay()], minDate: range.MN, maxDate: range.MX, summary, rows, trend,
  };
}
