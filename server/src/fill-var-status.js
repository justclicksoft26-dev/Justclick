// Rebuilds EMP_VAR_STATUS the same way the ADD_VAR_STATUS_TRI trigger on EMPLOYEES does,
// but for existing employees: one row per month from max(Jan, hire month) to Dec of the current HR year.
// Employees hired before the current year start in month 1; hired after it get no rows. Skips rows that already exist.
import { withTransaction } from './db.js';

const { inserted, total } = await withTransaction(async ({ exec }) => {
  const r = await exec(
    `INSERT INTO EMP_VAR_STATUS (
       VAR_YEAR, VAR_MONTH, SARF_CODE, JOB_CODE, COST_CENTER, SEC_CODE, DEPT_CODE, CONTRACT_CODE, UNIV,
       STUDY_QUAL, EMP_ACTIVE, MILITARY_STATUS, MARITAL_STATUS, EMP_SEX, EMP_ID, INSTRCT_ID, IS_SOCIAL, IS_TAX,
       IS_STUDENT, STUDENT_YEAR, STUDENT_DATE, IS_BLACKLIST, CATEGORY_ID, BRANCH_ID, WORK_DAY_CNT, WORK_HOUR_CNT,
       END_SERVICE_FLG, INSTRCT_ATT_ID)
     SELECT h.CURR_YEAR, m.n, e.SARF_CODE, e.JOB_CODE, e.COST_CENTER, e.SEC_CODE, e.DEPT_CODE, e.CONTRACT_CODE, e.UNIV,
            e.STUDY_QUAL, e.EMP_ACTIVE, e.MILITARY_STATUS, e.MARITAL_STATUS, e.EMP_SEX, e.EMP_ID, e.INSTRCT_ID, e.IS_SOCIAL, e.IS_TAX,
            e.IS_STUDENT, e.STUDENT_YEAR, e.STUDENT_DATE, e.IS_BLACKLIST, e.CATEGORY_ID, e.BRANCH_ID, e.WORK_DAY_CNT, e.WORK_HOUR_CNT,
            NVL(e.END_SERVICE_FLG, 'N'), e.INSTRCT_ATT_ID
       FROM EMPLOYEES e
       CROSS JOIN HR_SYS_INFO h
       JOIN (SELECT LEVEL n FROM DUAL CONNECT BY LEVEL <= 12) m
         ON m.n >= CASE WHEN e.HIRE_DATE IS NULL OR EXTRACT(YEAR FROM e.HIRE_DATE) < h.CURR_YEAR THEN 1
                        WHEN EXTRACT(YEAR FROM e.HIRE_DATE) = h.CURR_YEAR THEN EXTRACT(MONTH FROM e.HIRE_DATE)
                        ELSE 13 END
      WHERE NOT EXISTS (SELECT 1 FROM EMP_VAR_STATUS s
                         WHERE s.EMP_ID = e.EMP_ID AND s.VAR_YEAR = h.CURR_YEAR AND s.VAR_MONTH = m.n)`,
  );
  const t = await exec('SELECT COUNT(*) C FROM EMP_VAR_STATUS');
  return { inserted: r.rowsAffected, total: t.rows[0].C };
});
console.log(`inserted ${inserted} rows; EMP_VAR_STATUS now has ${total}`);
process.exit(0);
