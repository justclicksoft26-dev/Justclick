import oracledb from 'oracledb';
import { query, withTransaction } from './db.js';
import { STATUSES } from './validation.js';

// Weekday numbering the ERP stores in OFFCIAL_HOLIDAY_M.DAY_IN_WEEK is Oracle's TO_CHAR(date,'D')
// under the database default (NLS_TERRITORY=AMERICA): Sunday=1 ... Saturday=7. JS getDay() is 0-based.
const toDayInWeek = (jsDay) => String(jsDay + 1);
const fromDayInWeek = (v) => Number(v) - 1;

const hhmm = (c) => `TO_CHAR(${c},'HH24:MI')`;
const ymd = (c) => `TO_CHAR(${c},'YYYY-MM-DD')`;

const EMP_ORDER = 'ORDER BY e.EMP_ID';

/**
 * Loads employees (with job, shifts, weekly off, holidays, vacations) overlapping [from, to].
 * Pass empId to load a single employee.
 */
export async function loadEmployees({ empId = null, from, to, today }) {
  const filter = empId == null ? '' : 'AND e.EMP_ID = :id';
  const b = (extra = {}) => (empId == null ? extra : { id: empId, ...extra });

  const emps = (await query(
    `SELECT e.EMP_ID, e.EMP_NAME_AR, TRIM(e.ID_NO) ID_NO, TRIM(j.LOOK_UP_NAME_AR) JOB,
            ${ymd('e.HIRE_DATE')} HIRE_DATE, ${ymd('e.END_SERVICE_DATE')} END_DATE,
            e.EMP_ACTIVE, e.END_SERVICE_FLG, NVL(g.GRACE_MIN, 0) GRACE_MIN
       FROM EMPLOYEES e
       LEFT JOIN LOOK_UP j ON j.PARENT_ID = 12 AND j.LOOK_UP_ID = e.JOB_CODE
       LEFT JOIN ATTM_EMP_SETTING g ON g.EMP_ID = e.EMP_ID
      WHERE 1 = 1 ${filter} ${EMP_ORDER}`,
    b(),
  )).rows;

  const shifts = (await query(
    `SELECT se.EMP_ID, ${ymd('se.SHIFT_DATE_FROM')} DF, ${ymd('se.SHIFT_DATE_TO')} DT,
            ${hhmm('s.SHIFT_FROM')} T_FROM, ${hhmm('s.SHIFT_TO')} T_TO
       FROM SHIFT_EMP se JOIN SHIFT_SETUP s ON s.SHIFT_ID = se.SHIFT_ID
      WHERE se.SHIFT_DATE_TO >= TO_DATE(:f,'YYYY-MM-DD') AND se.SHIFT_DATE_FROM <= TO_DATE(:t,'YYYY-MM-DD')
        ${empId == null ? '' : 'AND se.EMP_ID = :id'}`,
    b({ f: from, t: to }),
  )).rows;

  const holidays = (await query(
    `SELECT d.EMP_ID, m.DAY_IN_WEEK, ${ymd('m.F_DATE')} DF, ${ymd('m.T_DATE')} DT
       FROM OFFCIAL_HOLIDAY_D d JOIN OFFCIAL_HOLIDAY_M m ON m.HOLIDAY_ID = d.HOLIDAY_ID
      WHERE (m.F_DATE IS NULL AND m.DAY_IN_WEEK IS NOT NULL)
         OR (m.F_DATE <= TO_DATE(:t,'YYYY-MM-DD') AND NVL(m.T_DATE, m.F_DATE) >= TO_DATE(:f,'YYYY-MM-DD'))
        ${empId == null ? '' : 'AND d.EMP_ID = :id'}`,
    b({ f: from, t: to }),
  )).rows;

  // today is always loaded so the derived "on leave" status is right even outside the report range
  const lo = from < today ? from : today;
  const hi = to > today ? to : today;
  const vacations = (await query(
    `SELECT v.EMP_ID, ${ymd('v.FROM_DATE')} DF, ${ymd('v.TO_DATE')} DT FROM EMP_VACATION v
      WHERE v.TO_DATE >= TO_DATE(:f,'YYYY-MM-DD') AND v.FROM_DATE <= TO_DATE(:t,'YYYY-MM-DD')
        ${empId == null ? '' : 'AND v.EMP_ID = :id'}`,
    b({ f: lo, t: hi }),
  )).rows;

  const by = (rows) => Map.groupBy(rows, (r) => r.EMP_ID);
  const sh = by(shifts), ho = by(holidays), va = by(vacations);
  const range = (r) => ({ from: r.DF, to: r.DT ?? r.DF });
  const toMin = (s) => (s ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3)) : null);

  return emps.map((r) => {
    const empShifts = (sh.get(r.EMP_ID) ?? []).map((s) => ({
      from: s.DF, to: s.DT, startText: s.T_FROM, endText: s.T_TO, start: toMin(s.T_FROM), end: toMin(s.T_TO),
    }));
    const empHol = ho.get(r.EMP_ID) ?? [];
    const empVac = (va.get(r.EMP_ID) ?? []).map(range);
    const onLeaveToday = empVac.some((v) => v.from <= today && today <= v.to);
    const status = r.END_SERVICE_FLG === 'Y' ? 'RESIGNED' : r.EMP_ACTIVE !== 'Y' ? 'SUSPENDED' : onLeaveToday ? 'ON_LEAVE' : 'ACTIVE';
    const current = empShifts.find((s) => s.from <= today && today <= s.to) ?? empShifts.at(-1);
    return {
      code: String(r.EMP_ID), name: r.EMP_NAME_AR?.trim() ?? '', nationalId: r.ID_NO ?? '', job: r.JOB ?? '',
      hireDate: r.HIRE_DATE, endDate: r.END_DATE, status, statusLabel: STATUSES[status],
      graceMin: r.GRACE_MIN,
      shiftStart: current?.startText ?? null, shiftEnd: current?.endText ?? null,
      weeklyOff: [...new Set(empHol.filter((h) => !h.DF).map((h) => fromDayInWeek(h.DAY_IN_WEEK)))].sort(),
      holidays: empHol.filter((h) => h.DF).map(range),
      vacations: empVac,
      shifts: empShifts,
      _id: r.EMP_ID,
    };
  });
}

export const publicEmployee = ({ holidays, vacations, shifts, _id, ...rest }) => rest;

export async function countPunches() {
  return (await query('SELECT COUNT(*) C FROM ATT_EMP')).rows[0].C;
}

const FMT = 'YYYY-MM-DD HH24:MI:SS';
const keyOf = (emp, day) => `${emp}|${day}`;

/**
 * ATT_EMP is unique on (EMP_ID, ATT_DATE, ATT_FLAG): one 'I' row and one 'O' row per employee per day.
 * So per day we keep the earliest punch as 'I' and the latest as 'O' (nothing in between, and no 'O'
 * when there is a single punch), merging with whatever the ERP already holds for that day.
 */
export async function storePunches(rows) {
  const groups = new Map();
  for (const r of rows) {
    const day = r.ts.slice(0, 10);
    const g = groups.get(keyOf(r.code, day)) ?? { emp: Number(r.code), day, min: r.ts, max: r.ts };
    if (r.ts < g.min) g.min = r.ts;
    if (r.ts > g.max) g.max = r.ts;
    groups.set(keyOf(r.code, day), g);
  }
  const list = [...groups.values()];
  if (!list.length) return { received: 0, stored: 0 };

  const days = list.map((g) => g.day).sort();
  const emps = [...new Set(list.map((g) => g.emp))];

  return withTransaction(async ({ exec, execMany }) => {
    const meta = (await exec('SELECT COMPANY_CODE C, FISCAL_YEAR F, BRANCH_ID B FROM HR_SYS_INFO FETCH FIRST 1 ROW ONLY')).rows[0] ?? {};
    const existing = new Map();
    for (let i = 0; i < emps.length; i += 500) {
      const chunk = emps.slice(i, i + 500);
      const binds = Object.fromEntries(chunk.map((e, k) => [`e${k}`, e]));
      const res = await exec(
        `SELECT EMP_ID, ${ymd('ATT_DATE')} D, ATT_FLAG, TO_CHAR(ATT_TIME,'${FMT}') T FROM ATT_EMP
          WHERE ATT_TIME IS NOT NULL AND ATT_DATE BETWEEN TO_DATE(:lo,'YYYY-MM-DD') AND TO_DATE(:hi,'YYYY-MM-DD')
            AND EMP_ID IN (${chunk.map((_, k) => `:e${k}`).join(',')})`,
        { lo: days[0], hi: days.at(-1), ...binds },
      );
      for (const r of res.rows) {
        const k = keyOf(r.EMP_ID, r.D);
        const e = existing.get(k) ?? { times: [] };
        e.times.push(r.T);
        if (r.ATT_FLAG === 'I' || r.ATT_FLAG === 'O') e[r.ATT_FLAG] = r.T;
        existing.set(k, e);
      }
    }

    const inserts = [];
    const updates = [];
    for (const g of list) {
      const e = existing.get(keyOf(g.emp, g.day)) ?? { times: [] };
      const lo = [g.min, ...e.times].reduce((a, b) => (b < a ? b : a));
      const hi = [g.max, ...e.times].reduce((a, b) => (b > a ? b : a));
      const want = { I: lo, ...(hi > lo ? { O: hi } : {}) };
      for (const [flag, t] of Object.entries(want)) {
        if (e[flag] === t) continue;
        (e[flag] ? updates : inserts).push({ emp: g.emp, day: g.day, flag, t });
      }
    }
    if (inserts.length) {
      await execMany(
        `INSERT INTO ATT_EMP (EMP_ID, ATT_TIME, ATT_FLAG, COMPANY_CODE, FISCAL_YEAR, BRANCH_ID)
         VALUES (:emp, TO_DATE(:t,'${FMT}'), :flag, ${meta.C ?? 'NULL'}, ${meta.F ?? 'NULL'}, ${meta.B ?? 0})`,
        inserts.map(({ emp, flag, t }) => ({ emp, flag, t })),
        { bindDefs: { emp: { type: oracledb.NUMBER }, flag: { type: oracledb.STRING, maxSize: 1 }, t: { type: oracledb.STRING, maxSize: 19 } } },
      );
    }
    if (updates.length) {
      await execMany(
        `UPDATE ATT_EMP SET ATT_TIME = TO_DATE(:t,'${FMT}')
          WHERE EMP_ID = :emp AND ATT_DATE = TO_DATE(:day,'YYYY-MM-DD') AND ATT_FLAG = :flag`,
        updates,
        { bindDefs: { t: { type: oracledb.STRING, maxSize: 19 }, emp: { type: oracledb.NUMBER }, day: { type: oracledb.STRING, maxSize: 10 }, flag: { type: oracledb.STRING, maxSize: 1 } } },
      );
    }
    return { received: rows.length, stored: inserts.length + updates.length };
  });
}

export class Conflict extends Error {
  constructor(errors) {
    super('conflict');
    this.errors = errors;
  }
}

/** Registers an employee in the ERP: EMPLOYEES + job lookup + shift + weekly-off holiday rows. */
export async function createEmployee(v) {
  return withTransaction(async ({ exec }) => {
    const id = Number(v.code);
    const conflicts = {};
    if ((await exec('SELECT 1 FROM EMPLOYEES WHERE EMP_ID = :id', { id })).rows.length) conflicts.code = 'كود الموظف مسجل مسبقا';
    if ((await exec('SELECT 1 FROM EMPLOYEES WHERE TRIM(ID_NO) = :n', { n: v.nid })).rows.length) conflicts.nationalId = 'رقم الهوية مسجل مسبقا';
    if (Object.keys(conflicts).length) throw new Conflict(conflicts);

    const meta = (await exec('SELECT COMPANY_CODE C, FISCAL_YEAR F, BRANCH_ID B FROM HR_SYS_INFO FETCH FIRST 1 ROW ONLY')).rows[0] ?? {};
    const branch = (await exec('SELECT BRANCH_ID B FROM EMPLOYEES WHERE BRANCH_ID IS NOT NULL GROUP BY BRANCH_ID ORDER BY COUNT(*) DESC FETCH FIRST 1 ROW ONLY')).rows[0]?.B ?? meta.B ?? 0;

    // job: reuse the lookup row with the same name, otherwise add one (the LOOK_UP trigger assigns the id)
    let job = (await exec(`SELECT LOOK_UP_ID ID FROM LOOK_UP WHERE PARENT_ID = 12 AND TRIM(LOOK_UP_NAME_AR) = :j FETCH FIRST 1 ROW ONLY`, { j: v.job })).rows[0]?.ID;
    if (job == null) {
      const r = await exec(
        `INSERT INTO LOOK_UP (PARENT_ID, LOOK_UP_NAME_AR, LOOK_UP_NAME_EN, COMPANY_CODE, FISCAL_YEAR, BRANCH_ID)
         VALUES (12, :j, :j, :c, :f, :b) RETURNING LOOK_UP_ID INTO :id`,
        { j: v.job, c: meta.C ?? null, f: meta.F ?? null, b: meta.B ?? 0, id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } },
      );
      job = r.outBinds.id[0];
    }

    await exec(
      `INSERT INTO EMPLOYEES (EMP_ID, EMP_NAME_AR, ID_NO, JOB_CODE, HIRE_DATE, EMP_ACTIVE, END_SERVICE_FLG, END_SERVICE_DATE,
                              COMPANY_CODE, FISCAL_YEAR, BRANCH_ID)
       VALUES (:id, :name, :nid, :job, TO_DATE(:hd,'YYYY-MM-DD'), :active, :ended, ${v.status === 'RESIGNED' ? 'TRUNC(SYSDATE)' : 'NULL'},
               :c, :f, :b)`,
      {
        id, name: v.name, nid: v.nid, job, hd: v.hireDate,
        active: v.status === 'SUSPENDED' ? 'N' : 'Y', ended: v.status === 'RESIGNED' ? 'Y' : 'N',
        c: meta.C ?? null, f: meta.F ?? null, b: branch,
      },
    );

    // shift: reuse a SHIFT_SETUP row with the same times, otherwise add one
    const FMT_T = 'HH24:MI';
    let shift = (await exec(
      `SELECT SHIFT_ID ID FROM SHIFT_SETUP WHERE TO_CHAR(SHIFT_FROM,'${FMT_T}') = :s AND TO_CHAR(SHIFT_TO,'${FMT_T}') = :e FETCH FIRST 1 ROW ONLY`,
      { s: v.start, e: v.end },
    )).rows[0]?.ID;
    if (shift == null) {
      const name = `دوام ${v.start} - ${v.end}`;
      shift = (await exec('SELECT SHIFT_SEQ.NEXTVAL N FROM DUAL')).rows[0].N;
      await exec(
        `INSERT INTO SHIFT_SETUP (SHIFT_ID, SHIFT_NAME_AR, SHIFT_NAME_EN, SHIFT_FROM, SHIFT_TO, FLIXBLE_ALLOW)
         VALUES (:id, :n, :n, TO_TIMESTAMP('2025-01-01 ' || :s,'YYYY-MM-DD HH24:MI'), TO_TIMESTAMP('2025-01-01 ' || :e,'YYYY-MM-DD HH24:MI'), 0)`,
        { id: shift, n: name, s: v.start, e: v.end },
      );
    }
    await exec(
      `INSERT INTO SHIFT_EMP (SHIFT_EMP_SQ, SHIFT_ID, EMP_ID, SHIFT_DATE_FROM, SHIFT_DATE_TO)
       VALUES (SHIFT_EMP_SEQ.NEXTVAL, :s, :id, TO_DATE(:hd,'YYYY-MM-DD'), DATE '2099-12-31')`,
      { s: shift, id, hd: v.hireDate },
    );

    // weekly off: one OFFCIAL_HOLIDAY_M row per weekday (F_DATE null), linked to the employee in _D
    for (const day of v.weeklyOff) {
      const diw = toDayInWeek(day);
      let hid = (await exec(
        'SELECT MIN(HOLIDAY_ID) ID FROM OFFCIAL_HOLIDAY_M WHERE F_DATE IS NULL AND DAY_IN_WEEK = :d',
        { d: diw },
      )).rows[0]?.ID;
      if (hid == null) {
        hid = (await exec('SELECT OFFCIAL_HOLIDAY_M_SEQ.NEXTVAL N FROM DUAL')).rows[0].N;
        await exec(
          `INSERT INTO OFFCIAL_HOLIDAY_M (HOLIDAY_ID, HOLIDAY_NAME_AR, HOLIDAY_NAME_EN, DAY_IN_WEEK, COMPANY_CODE, FISCAL_YEAR, BRANCH_ID)
           VALUES (:id, :n, :n, :d, :c, :f, :b)`,
          { id: hid, n: `إجازة أسبوعية (${diw})`, d: diw, c: meta.C ?? null, f: meta.F ?? null, b: meta.B ?? 0 },
        );
      }
      await exec(
        `INSERT INTO OFFCIAL_HOLIDAY_D (HOLIDAY_ID_D, HOLIDAY_ID, EMP_ID)
         VALUES ((SELECT NVL(MAX(HOLIDAY_ID_D),0)+1 FROM OFFCIAL_HOLIDAY_D), :h, :id)`,
        { h: hid, id },
      );
    }

    await exec('INSERT INTO ATTM_EMP_SETTING (EMP_ID, GRACE_MIN) VALUES (:id, :g)', { id, g: v.grace });
  });
}

// Tables we clean up ourselves when deleting; any other table holding the employee blocks the delete.
const OWNED = new Set(['EMPLOYEES', 'SHIFT_EMP', 'OFFCIAL_HOLIDAY_D', 'EMP_VAR_STATUS', 'ATTM_EMP_SETTING']);

/** Deletes an employee only if nothing else in the ERP (punches, payroll, vacations...) references it. */
export async function deleteEmployee(code) {
  const id = Number(code);
  return withTransaction(async ({ exec }) => {
    if (!(await exec('SELECT 1 FROM EMPLOYEES WHERE EMP_ID = :id', { id })).rows.length) return { found: false };

    const tables = (await exec(
      `SELECT c.TABLE_NAME FROM USER_TAB_COLUMNS c JOIN USER_TABLES t ON t.TABLE_NAME = c.TABLE_NAME
        WHERE c.COLUMN_NAME = 'EMP_ID' AND c.DATA_TYPE = 'NUMBER'`,
    )).rows.map((r) => r.TABLE_NAME).filter((t) => !OWNED.has(t) && !t.startsWith('ATT_EMP_TEMP'));
    const used = [];
    for (const t of tables) {
      const n = (await exec(`SELECT COUNT(*) C FROM "${t}" WHERE EMP_ID = :id`, { id })).rows[0].C;
      if (n) used.push(t);
    }
    if (used.length) return { found: true, blocked: used };

    for (const t of ['ATTM_EMP_SETTING', 'OFFCIAL_HOLIDAY_D', 'SHIFT_EMP', 'EMP_VAR_STATUS']) {
      await exec(`DELETE FROM ${t} WHERE EMP_ID = :id`, { id });
    }
    await exec('DELETE FROM EMPLOYEES WHERE EMP_ID = :id', { id });
    return { found: true, blocked: [] };
  });
}
