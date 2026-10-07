import { query, withTransaction } from './db.js';

// "ترحيل المواعيد الفعلية" (APEX page 254): turns raw punches (ATT_EMP) into one actual-times row per
// employee per day (EMP_IO_TIMES) by calling the ERP's own POST_IO_EMP_PRC, then reads those rows back
// for the actual-times grid and the late/absence report.

const ymd = (c) => `TO_CHAR(${c},'YYYY-MM-DD')`;
const hhmm = (c) => `TO_CHAR(${c},'HH24:MI')`;

export async function getDefaults() {
  const { rows } = await query(
    `SELECT ${ymd('MONTH_START_DATE')} F, ${ymd('MONTH_END_DATE')} T, CURR_YEAR Y, CURR_MONTH M FROM HR_SYS_INFO FETCH FIRST 1 ROW ONLY`,
  );
  return { from: rows[0].F, to: rows[0].T, year: rows[0].Y, month: rows[0].M };
}

export async function getLookups() {
  const look = async (parent) =>
    (await query('SELECT LOOK_UP_ID ID, TRIM(LOOK_UP_NAME_AR) NAME FROM LOOK_UP WHERE PARENT_ID = :p ORDER BY LOOK_UP_ID', { p: parent })).rows
      .map((r) => ({ id: r.ID, name: r.NAME }));
  return { depts: await look(8), jobs: await look(12) };
}

const ids = (list) => (Array.isArray(list) ? list.map(Number).filter((n) => Number.isInteger(n) && n >= 0) : []);

/** Employees in scope, as the ERP screen does: those with an EMP_VAR_STATUS row for the current HR period. */
export async function selectEmployees({ from, depts = [], jobs = [], emps = [] }, exec = query) {
  const hr = await getDefaults();
  const binds = { y: hr.year, m: hr.month, f: from };
  const filter = (col, list, tag) => {
    const v = ids(list);
    if (!v.length) return '';
    v.forEach((n, i) => { binds[`${tag}${i}`] = n; });
    return ` AND ${col} IN (${v.map((_, i) => `:${tag}${i}`).join(',')})`;
  };
  const sql = `SELECT ev.EMP_ID, ${ymd('e.HIRE_DATE')} HIRE, ${ymd('e.END_SERVICE_DATE')} ENDED
      FROM EMPLOYEES e JOIN EMP_VAR_STATUS ev ON ev.EMP_ID = e.EMP_ID
     WHERE ev.VAR_YEAR = :y AND ev.VAR_MONTH = :m
       AND (e.END_SERVICE_DATE IS NULL OR e.END_SERVICE_DATE > TO_DATE(:f,'YYYY-MM-DD'))
       ${filter('ev.DEPT_CODE', depts, 'd')}${filter('ev.JOB_CODE', jobs, 'j')}${filter('ev.EMP_ID', emps, 'e')}
     ORDER BY ev.EMP_ID`;
  const { rows } = await exec(sql, binds);
  return rows.map((r) => ({ id: r.EMP_ID, hire: r.HIRE, ended: r.ENDED }));
}

const addDays = (s, n) => {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const shiftGap = (msg) => {
  const m = /has no determined shift in (\d{2}-[A-Z]{3}-\d{2,4})/i.exec(msg ?? '');
  return m ? `لا يوجد دوام محدد بتاريخ ${m[1]}` : 'تعذر الترحيل لهذا الموظف';
};

/**
 * Same steps as the APEX process: per employee delete the period's EMP_IO_TIMES rows, then call
 * POST_IO_EMP_PRC. Differences: an employee failing (usually "no shift on a date") is rolled back and
 * reported instead of failing the whole run, and the range starts at the hire date.
 */
export async function postActualTimes(filters) {
  const { from, to } = filters;
  const emps = await selectEmployees(filters);
  const hr = (await query('SELECT MAX_OUT_IN_DAY X FROM HR_SYS_INFO FETCH FIRST 1 ROW ONLY')).rows[0];

  return withTransaction(async ({ exec }) => {
    const posted = [];
    const skipped = [];
    for (const e of emps) {
      const start = e.hire && e.hire > from ? e.hire : from;
      const end = e.ended && addDays(e.ended, -1) < to ? addDays(e.ended, -1) : to;
      if (start > end) {
        skipped.push({ id: e.id, reason: 'خارج فترة الخدمة' });
        continue;
      }
      await exec('SAVEPOINT emp_sp');
      try {
        await exec(
          `DELETE FROM EMP_IO_TIMES WHERE EMP_ID = :e AND FROM_IO_DATE BETWEEN TO_DATE(:f,'YYYY-MM-DD') AND TO_DATE(:t,'YYYY-MM-DD')`,
          { e: e.id, f: start, t: end },
        );
        await exec(
          `BEGIN POST_IO_EMP_PRC(:e, TO_DATE(:f,'YYYY-MM-DD'), TO_DATE(:t,'YYYY-MM-DD'), :x); END;`,
          { e: e.id, f: start, t: end, x: hr.X },
        );
        posted.push(e.id);
      } catch (err) {
        await exec('ROLLBACK TO emp_sp');
        skipped.push({ id: e.id, reason: shiftGap(err.message) });
      }
    }
    return { employees: emps.length, posted: posted.length, skipped };
  });
}

const toMin = (s) => (s ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3)) : null);

// IN_FLAG / OUT_FLAG values written by POST_IO_EMP_PRC
const IN_LABEL = { 5: 'غائب', 7: 'بدون بصمة حضور', 111: 'حاضر', 113: 'إجازة أسبوعية', 114: 'إجازة', 115: 'مأمورية', 3: 'إذن' };

function describe(r, grace) {
  const out = { lateMinutes: 0, status: IN_LABEL[r.IN_FLAG] ?? 'حاضر' };
  if (r.IN_FLAG === 1) {
    const mins = toMin(r.IN_T) - toMin(r.SHIFT_F);
    if (mins > grace) {
      out.lateMinutes = mins;
      out.status = 'تأخير';
    } else {
      out.status = 'حاضر';
    }
  }
  return out;
}

/** Posted actual times for the range, one row per employee per day. */
export async function getActualTimes(filters) {
  const { from, to } = filters;
  const emps = await selectEmployees(filters);
  if (!emps.length) return [];
  const binds = { f: from, t: to };
  emps.forEach((e, i) => { binds[`i${i}`] = e.id; });
  const { rows } = await query(
    `SELECT x.EMP_ID, TRIM(e.EMP_NAME_AR) NAME, ${ymd('x.FROM_IO_DATE')} D, ${hhmm('x.IN_TIME')} IN_T, ${hhmm('x.OUT_TIME')} OUT_T,
            x.IN_FLAG, x.OUT_FLAG, ${hhmm('x.SHIFT_DATE_FROM')} SHIFT_F, ${hhmm('x.SHIFT_DATE_TO')} SHIFT_T, NVL(g.GRACE_MIN, 0) GRACE
       FROM EMP_IO_TIMES x JOIN EMPLOYEES e ON e.EMP_ID = x.EMP_ID
       LEFT JOIN ATTM_EMP_SETTING g ON g.EMP_ID = x.EMP_ID
      WHERE x.FROM_IO_DATE BETWEEN TO_DATE(:f,'YYYY-MM-DD') AND TO_DATE(:t,'YYYY-MM-DD')
        AND x.EMP_ID IN (${emps.map((_, i) => `:i${i}`).join(',')})
      ORDER BY x.EMP_ID, x.FROM_IO_DATE`,
    binds,
  );
  const dayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  return rows.map((r) => {
    const d = describe(r, r.GRACE);
    return {
      code: String(r.EMP_ID),
      name: r.NAME,
      date: r.D,
      dayName: dayNames[new Date(`${r.D}T00:00:00Z`).getUTCDay()],
      checkIn: r.IN_T,
      checkOut: r.OUT_T ?? (r.IN_T ? 'بدون انصراف' : null),
      shift: r.SHIFT_F ? `${r.SHIFT_F} - ${r.SHIFT_T}` : null,
      lateMinutes: d.lateMinutes,
      status: d.status,
    };
  });
}

/**
 * Deduction rule per employee (days):
 *  - every 3 lates of up to 15 min count as one 30-min late (ربع يوم)
 *  - late over 15 up to 30 min = ربع يوم, over 30 up to 120 min = نصف يوم, over 120 min = يوم غياب
 */
export function lateDeduction({ upTo15, upTo30, upTo120, over120 }) {
  return Math.floor(upTo15 / 3) * 0.25 + upTo30 * 0.25 + upTo120 * 0.5 + over120;
}

/** Late/absence counts per employee, from the posted rows (employees with nothing posted are not listed). */
export function summarizeLateAbsent(rows, activeCodes) {
  const by = new Map();
  for (const r of rows) {
    if (!activeCodes.has(r.code)) continue;
    const s = by.get(r.code) ?? {
      code: r.code, name: r.name, lateCount: 0, lateMinutes: 0, absentCount: 0,
      upTo15: 0, upTo30: 0, upTo120: 0, over120: 0, deductionDays: 0,
    };
    if (r.status === 'تأخير') {
      s.lateCount++;
      s.lateMinutes += r.lateMinutes;
      const m = r.lateMinutes;
      if (m <= 15) s.upTo15++;
      else if (m <= 30) s.upTo30++;
      else if (m <= 120) s.upTo120++;
      else s.over120++;
    } else if (r.status === 'غائب') {
      s.absentCount++;
    }
    by.set(r.code, s);
  }
  return [...by.values()].map((s) => ({ ...s, deductionDays: lateDeduction(s) }));
}
