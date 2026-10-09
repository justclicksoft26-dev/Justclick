import { query, withTransaction } from './db.js';
import { isValidDate } from './validation.js';

// Official holidays ("العطلات الرسمية", APEX page 260): OFFCIAL_HOLIDAY_M holds the holiday (name + date range),
// OFFCIAL_HOLIDAY_D links it to the employees it applies to. POST_IO_EMP_PRC reads both when posting actual
// times. Weekly days off are rows of the same table with DAY_IN_WEEK set and no dates; this module only
// manages the dated ones (the table's check constraint requires F_DATE and T_DATE both set for those).

const ymd = (c) => `TO_CHAR(${c},'YYYY-MM-DD')`;
const MAX_DAYS = 60;

const daysBetween = (f, t) => Math.round((new Date(`${t}T00:00:00Z`) - new Date(`${f}T00:00:00Z`)) / 86400000) + 1;

const ACTIVE = `EMP_ACTIVE = 'Y' AND NVL(END_SERVICE_FLG, 'N') <> 'Y'`;

export async function listHolidays() {
  const rows = (await query(
    `SELECT m.HOLIDAY_ID, TRIM(m.HOLIDAY_NAME_AR) NAME_AR, TRIM(m.HOLIDAY_NAME_EN) NAME_EN,
            ${ymd('m.F_DATE')} F, ${ymd('m.T_DATE')} T,
            (SELECT COUNT(*) FROM OFFCIAL_HOLIDAY_D d WHERE d.HOLIDAY_ID = m.HOLIDAY_ID) N
       FROM OFFCIAL_HOLIDAY_M m
      WHERE m.F_DATE IS NOT NULL
      ORDER BY m.F_DATE DESC, m.HOLIDAY_ID DESC`,
  )).rows;
  const active = (await query(`SELECT COUNT(*) C FROM EMPLOYEES WHERE ${ACTIVE}`)).rows[0].C;
  return {
    activeEmployees: active,
    holidays: rows.map((r) => ({
      id: r.HOLIDAY_ID, nameAr: r.NAME_AR ?? '', nameEn: r.NAME_EN ?? '', from: r.F, to: r.T,
      days: daysBetween(r.F, r.T), employees: r.N,
    })),
  };
}

export async function getHoliday(id) {
  const m = (await query(
    `SELECT HOLIDAY_ID, TRIM(HOLIDAY_NAME_AR) NAME_AR, TRIM(HOLIDAY_NAME_EN) NAME_EN, ${ymd('F_DATE')} F, ${ymd('T_DATE')} T
       FROM OFFCIAL_HOLIDAY_M WHERE HOLIDAY_ID = :id AND F_DATE IS NOT NULL`,
    { id },
  )).rows[0];
  if (!m) return null;
  const emps = (await query('SELECT EMP_ID FROM OFFCIAL_HOLIDAY_D WHERE HOLIDAY_ID = :id', { id })).rows.map((r) => String(r.EMP_ID));
  return { id: m.HOLIDAY_ID, nameAr: m.NAME_AR ?? '', nameEn: m.NAME_EN ?? '', from: m.F, to: m.T, emps };
}

export function validateHoliday(body) {
  const errors = {};
  const nameAr = String(body.nameAr ?? '').trim();
  const nameEn = String(body.nameEn ?? '').trim();
  const from = String(body.from ?? '').trim();
  const to = String(body.to ?? '').trim() || from;
  const scope = body.scope === 'selected' ? 'selected' : 'all';
  const emps = [...new Set((Array.isArray(body.emps) ? body.emps : []).map(Number))].filter((n) => Number.isInteger(n) && n > 0);

  if (!nameAr) errors.nameAr = 'اسم العطلة مطلوب';
  else if (nameAr.length > 100) errors.nameAr = 'الاسم طويل جدا';
  if (nameEn.length > 100) errors.nameEn = 'الاسم طويل جدا';
  if (!isValidDate(from)) errors.from = 'تاريخ بداية العطلة غير صحيح';
  if (!isValidDate(to)) errors.to = 'تاريخ نهاية العطلة غير صحيح';
  else if (isValidDate(from) && to < from) errors.to = 'النهاية لازم تكون بعد البداية';
  else if (isValidDate(from) && daysBetween(from, to) > MAX_DAYS) errors.to = `الحد الأقصى ${MAX_DAYS} يوم`;
  if (scope === 'selected' && !emps.length) errors.emps = 'اختار موظف واحد على الأقل أو طبّق العطلة على الكل';

  return { errors, values: { nameAr, nameEn: nameEn || nameAr, from, to, scope, emps } };
}

/** Creates (id = null) or updates a holiday and makes its employee links match the chosen scope. */
export async function saveHoliday(id, v) {
  return withTransaction(async ({ exec, execMany }) => {
    let hid = id;
    if (hid != null) {
      const found = (await exec('SELECT 1 FROM OFFCIAL_HOLIDAY_M WHERE HOLIDAY_ID = :id AND F_DATE IS NOT NULL', { id: hid })).rows.length;
      if (!found) return null;
      await exec(
        `UPDATE OFFCIAL_HOLIDAY_M SET HOLIDAY_NAME_AR = :a, HOLIDAY_NAME_EN = :e,
                F_DATE = TO_DATE(:f,'YYYY-MM-DD'), T_DATE = TO_DATE(:t,'YYYY-MM-DD') WHERE HOLIDAY_ID = :id`,
        { a: v.nameAr, e: v.nameEn, f: v.from, t: v.to, id: hid },
      );
    } else {
      const meta = (await exec('SELECT COMPANY_CODE C, FISCAL_YEAR F, BRANCH_ID B FROM HR_SYS_INFO FETCH FIRST 1 ROW ONLY')).rows[0] ?? {};
      hid = (await exec('SELECT OFFCIAL_HOLIDAY_M_SEQ.NEXTVAL N FROM DUAL')).rows[0].N;
      await exec(
        `INSERT INTO OFFCIAL_HOLIDAY_M (HOLIDAY_ID, HOLIDAY_NAME_AR, HOLIDAY_NAME_EN, F_DATE, T_DATE, COMPANY_CODE, FISCAL_YEAR, BRANCH_ID)
         VALUES (:id, :a, :e, TO_DATE(:f,'YYYY-MM-DD'), TO_DATE(:t,'YYYY-MM-DD'), :c, :fy, :b)`,
        { id: hid, a: v.nameAr, e: v.nameEn, f: v.from, t: v.to, c: meta.C ?? null, fy: meta.F ?? null, b: meta.B ?? 0 },
      );
    }

    let target;
    if (v.scope === 'all') {
      target = (await exec(`SELECT EMP_ID FROM EMPLOYEES WHERE ${ACTIVE}`)).rows.map((r) => r.EMP_ID);
    } else {
      const known = new Set((await exec('SELECT EMP_ID FROM EMPLOYEES')).rows.map((r) => r.EMP_ID));
      target = v.emps.filter((e) => known.has(e));
    }
    const want = new Set(target);
    const have = new Set((await exec('SELECT EMP_ID FROM OFFCIAL_HOLIDAY_D WHERE HOLIDAY_ID = :id', { id: hid })).rows.map((r) => r.EMP_ID));

    const drop = [...have].filter((e) => !want.has(e)).map((e) => ({ h: hid, e }));
    const add = [...want].filter((e) => !have.has(e));
    if (drop.length) await execMany('DELETE FROM OFFCIAL_HOLIDAY_D WHERE HOLIDAY_ID = :h AND EMP_ID = :e', drop);
    if (add.length) {
      // same numbering the ERP screen uses: no sequence on HOLIDAY_ID_D, so max + 1
      const base = (await exec('SELECT NVL(MAX(HOLIDAY_ID_D), 0) N FROM OFFCIAL_HOLIDAY_D')).rows[0].N;
      await execMany(
        'INSERT INTO OFFCIAL_HOLIDAY_D (HOLIDAY_ID_D, HOLIDAY_ID, EMP_ID) VALUES (:d, :h, :e)',
        add.map((e, i) => ({ d: base + i + 1, h: hid, e })),
      );
    }
    return { id: hid, employees: want.size };
  });
}

export async function deleteHoliday(id) {
  return withTransaction(async ({ exec }) => {
    const found = (await exec('SELECT 1 FROM OFFCIAL_HOLIDAY_M WHERE HOLIDAY_ID = :id AND F_DATE IS NOT NULL', { id })).rows.length;
    if (!found) return false;
    await exec('DELETE FROM OFFCIAL_HOLIDAY_D WHERE HOLIDAY_ID = :id', { id });
    await exec('DELETE FROM OFFCIAL_HOLIDAY_M WHERE HOLIDAY_ID = :id', { id });
    return true;
  });
}
