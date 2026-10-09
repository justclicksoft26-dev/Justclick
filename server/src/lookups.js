import oracledb from 'oracledb';
import { query, withTransaction } from './db.js';

// Same model as the ERP's APEX lookups: one LOOK_UP table, PARENT_ID is the code type, LOOK_UP_ID is
// assigned per type by the INS_LOOK_CODE_ID trigger. The types are fixed; their values are managed here.
// `col` is the EMPLOYEES column holding the chosen value, `field` the matching key in the API payload.
export const LOOKUP_TYPES = [
  { id: 12, key: 'jobs', field: 'jobId', col: 'JOB_CODE', name: 'الوظائف', single: 'وظيفة', varStatus: true },
  { id: 8, key: 'depts', field: 'deptId', col: 'DEPT_CODE', name: 'الإدارات', single: 'إدارة', varStatus: true },
  { id: 9, key: 'sections', field: 'sectionId', col: 'SEC_CODE', name: 'الأقسام', single: 'قسم', varStatus: true },
  { id: 10, key: 'costCenters', field: 'costCenterId', col: 'COST_CENTER', name: 'مراكز التكلفة', single: 'مركز تكلفة', varStatus: true },
  { id: 21, key: 'categories', field: 'categoryId', col: 'CATEGORY_ID', name: 'فئات الموظفين', single: 'فئة', varStatus: true },
  { id: 16, key: 'contracts', field: 'contractId', col: 'CONTRACT_CODE', name: 'أنواع العقود', single: 'نوع عقد', varStatus: true },
  { id: 3, key: 'genders', field: 'genderId', col: 'EMP_SEX', name: 'النوع', single: 'نوع' },
  { id: 1, key: 'marital', field: 'maritalId', col: 'MARITAL_STATUS', name: 'الحالة الاجتماعية', single: 'حالة اجتماعية' },
  { id: 4, key: 'military', field: 'militaryId', col: 'MILITARY_STATUS', name: 'الموقف من التجنيد', single: 'موقف تجنيد' },
  { id: 5, key: 'qualifications', field: 'qualId', col: 'STUDY_QUAL', name: 'المؤهلات الدراسية', single: 'مؤهل' },
];

export const typeById = (id) => LOOKUP_TYPES.find((t) => t.id === Number(id));

const usage = async (exec, t, id) => {
  let n = (await exec(`SELECT COUNT(*) C FROM EMPLOYEES WHERE ${t.col} = :id`, { id })).rows[0].C;
  if (t.varStatus) n += (await exec(`SELECT COUNT(*) C FROM EMP_VAR_STATUS WHERE ${t.col} = :id`, { id })).rows[0].C;
  return n;
};

/** Every type with its values: what the employee forms use to fill their dropdowns. */
export async function allOptions() {
  const rows = (await query(
    `SELECT PARENT_ID P, LOOK_UP_ID ID, TRIM(LOOK_UP_NAME_AR) NAME FROM LOOK_UP
      WHERE PARENT_ID IN (${LOOKUP_TYPES.map((t) => t.id).join(',')}) AND LOOK_UP_NAME_AR IS NOT NULL
      ORDER BY PARENT_ID, LOOK_UP_ID`,
  )).rows;
  const by = Map.groupBy(rows, (r) => r.P);
  return Object.fromEntries(LOOKUP_TYPES.map((t) => [t.key, (by.get(t.id) ?? []).map((r) => ({ id: r.ID, name: r.NAME }))]));
}

export async function listTypes() {
  const rows = (await query(
    `SELECT PARENT_ID P, COUNT(*) C FROM LOOK_UP WHERE LOOK_UP_NAME_AR IS NOT NULL
      AND PARENT_ID IN (${LOOKUP_TYPES.map((t) => t.id).join(',')}) GROUP BY PARENT_ID`,
  )).rows;
  const n = new Map(rows.map((r) => [r.P, r.C]));
  return LOOKUP_TYPES.map((t) => ({ id: t.id, key: t.key, name: t.name, single: t.single, count: n.get(t.id) ?? 0 }));
}

export async function listValues(typeId) {
  const t = typeById(typeId);
  if (!t) return null;
  const rows = (await query(
    `SELECT LOOK_UP_ID ID, TRIM(LOOK_UP_NAME_AR) A, TRIM(LOOK_UP_NAME_EN) E FROM LOOK_UP
      WHERE PARENT_ID = :p AND LOOK_UP_NAME_AR IS NOT NULL ORDER BY LOOK_UP_ID`,
    { p: t.id },
  )).rows;
  const used = (await query(`SELECT ${t.col} V, COUNT(*) C FROM EMPLOYEES WHERE ${t.col} IS NOT NULL GROUP BY ${t.col}`)).rows;
  const u = new Map(used.map((r) => [r.V, r.C]));
  return { type: { id: t.id, name: t.name, single: t.single }, values: rows.map((r) => ({ id: r.ID, nameAr: r.A, nameEn: r.E ?? '', employees: u.get(r.ID) ?? 0 })) };
}

export function validateLookup(body) {
  const errors = {};
  const nameAr = String(body.nameAr ?? '').trim();
  const nameEn = String(body.nameEn ?? '').trim();
  if (!nameAr) errors.nameAr = 'الاسم مطلوب';
  else if (nameAr.length > 200) errors.nameAr = 'الاسم طويل جدا';
  if (nameEn.length > 200) errors.nameEn = 'الاسم طويل جدا';
  return { errors, values: { nameAr, nameEn: nameEn || nameAr } };
}

export class Duplicate extends Error {}

export async function createValue(typeId, v) {
  const t = typeById(typeId);
  return withTransaction(async ({ exec }) => {
    if ((await exec('SELECT 1 FROM LOOK_UP WHERE PARENT_ID = :p AND TRIM(LOOK_UP_NAME_AR) = :n', { p: t.id, n: v.nameAr })).rows.length) throw new Duplicate();
    const meta = (await exec('SELECT COMPANY_CODE C, FISCAL_YEAR F, BRANCH_ID B FROM HR_SYS_INFO FETCH FIRST 1 ROW ONLY')).rows[0] ?? {};
    const r = await exec(
      `INSERT INTO LOOK_UP (PARENT_ID, LOOK_UP_NAME_AR, LOOK_UP_NAME_EN, COMPANY_CODE, FISCAL_YEAR, BRANCH_ID)
       VALUES (:p, :a, :e, :c, :f, :b) RETURNING LOOK_UP_ID INTO :id`,
      { p: t.id, a: v.nameAr, e: v.nameEn, c: meta.C ?? null, f: meta.F ?? null, b: meta.B ?? 0, id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } },
    );
    return { id: r.outBinds.id[0] };
  });
}

export async function updateValue(typeId, id, v) {
  const t = typeById(typeId);
  return withTransaction(async ({ exec }) => {
    if (!(await exec('SELECT 1 FROM LOOK_UP WHERE PARENT_ID = :p AND LOOK_UP_ID = :id', { p: t.id, id })).rows.length) return false;
    if ((await exec('SELECT 1 FROM LOOK_UP WHERE PARENT_ID = :p AND TRIM(LOOK_UP_NAME_AR) = :n AND LOOK_UP_ID <> :id', { p: t.id, n: v.nameAr, id })).rows.length) throw new Duplicate();
    await exec('UPDATE LOOK_UP SET LOOK_UP_NAME_AR = :a, LOOK_UP_NAME_EN = :e WHERE PARENT_ID = :p AND LOOK_UP_ID = :id', { a: v.nameAr, e: v.nameEn, p: t.id, id });
    return true;
  });
}

/** Returns { found, used } — a value still assigned to employees can't be removed. */
export async function deleteValue(typeId, id) {
  const t = typeById(typeId);
  return withTransaction(async ({ exec }) => {
    if (!(await exec('SELECT 1 FROM LOOK_UP WHERE PARENT_ID = :p AND LOOK_UP_ID = :id', { p: t.id, id })).rows.length) return { found: false };
    const used = await usage(exec, t, id);
    if (used) return { found: true, used };
    await exec('DELETE FROM LOOK_UP WHERE PARENT_ID = :p AND LOOK_UP_ID = :id', { p: t.id, id });
    return { found: true, used: 0 };
  });
}
