import { query, getPool } from './db.js';

// The module now works on the ERP tables (EMPLOYEES, SHIFT_*, OFFCIAL_HOLIDAY_*, EMP_VACATION, ATT_EMP).
// The ERP has no "late grace minutes" concept, so that single setting lives in its own small table.
const exists = async (name) =>
  (await query('SELECT COUNT(*) C FROM USER_TABLES WHERE TABLE_NAME = :n', { n: name })).rows[0].C > 0;

// Drop the first-iteration standalone tables, but only if they hold no data.
for (const old of ['ATTM_PUNCH', 'ATTM_EMPLOYEE']) {
  if (!(await exists(old))) continue;
  const n = (await query(`SELECT COUNT(*) C FROM ${old}`)).rows[0].C;
  if (n === 0) {
    await query(`DROP TABLE ${old} PURGE`);
    console.log(`${old}: dropped (was empty)`);
  } else {
    console.log(`${old}: kept, it has ${n} rows`);
  }
}

if (await exists('ATTM_EMP_SETTING')) {
  console.log('ATTM_EMP_SETTING: already exists');
} else {
  await query(`
    CREATE TABLE ATTM_EMP_SETTING (
      EMP_ID     NUMBER      NOT NULL,
      GRACE_MIN  NUMBER(2)   DEFAULT 0 NOT NULL,
      CONSTRAINT ATTM_EMP_SETTING_PK PRIMARY KEY (EMP_ID),
      CONSTRAINT ATTM_EMP_SETTING_GRACE_CK CHECK (GRACE_MIN BETWEEN 0 AND 60)
    )`);
  console.log('ATTM_EMP_SETTING: created');
}
await (await getPool()).close(0);
