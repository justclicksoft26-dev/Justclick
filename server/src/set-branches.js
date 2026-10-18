// One-off: creates the two school branches in BRANCHES and assigns every employee to one of them.
//   node src/set-branches.js <file.json>    (JSON object: { "<EMP_ID>": "<branch name from the ERP report>" })
// Names containing "الورود" go to branch 2, everything else (including the head-office staff) to branch 1.
// Runs in one transaction: either all employees are updated or none.
import fs from 'node:fs';
import { withTransaction, getPool } from './db.js';

const BRANCHES = [
  { id: 1, ar: 'مدارس الأفق العالمية - حي ظهرة لبن', en: 'Horizon International Schools - Dhahrat Laban' },
  { id: 2, ar: 'مدارس الأفق العالمية - حي الورود', en: 'Horizon International Schools - Al Wurud' },
];
const target = (name) => (name.includes('الورود') ? 2 : 1);

const map = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

await withTransaction(async ({ exec }) => {
  const hr = (await exec('SELECT COMPANY_CODE C, FISCAL_YEAR F FROM HR_SYS_INFO FETCH FIRST 1 ROW ONLY')).rows[0];
  for (const b of BRANCHES) {
    const has = (await exec('SELECT 1 FROM BRANCHES WHERE BRANCH_ID = :i', { i: b.id })).rows.length;
    if (has) {
      await exec('UPDATE BRANCHES SET BRANCH_NAME_AR = :a, BRANCH_NAME_EN = :e WHERE BRANCH_ID = :i', { i: b.id, a: b.ar, e: b.en });
    } else {
      await exec(
        'INSERT INTO BRANCHES (BRANCH_ID, BRANCH_CODE, BRANCH_NAME_AR, BRANCH_NAME_EN, COMPANY_CODE, FISCAL_YEAR) VALUES (:i, :i, :a, :e, :c, :f)',
        { i: b.id, a: b.ar, e: b.en, c: hr.C, f: hr.F },
      );
    }
  }

  const known = new Set((await exec('SELECT EMP_ID FROM EMPLOYEES')).rows.map((r) => String(r.EMP_ID)));
  const missing = [];
  let updated = 0;
  for (const [code, name] of Object.entries(map)) {
    if (!known.has(code)) { missing.push(code); continue; }
    const b = target(name);
    await exec('UPDATE EMPLOYEES SET BRANCH_ID = :b WHERE EMP_ID = :e', { b, e: Number(code) });
    await exec('UPDATE EMP_VAR_STATUS SET BRANCH_ID = :b WHERE EMP_ID = :e', { b, e: Number(code) });
    updated++;
  }
  console.log('employees updated:', updated, '| not found in ERP:', missing);
  console.log('EMPLOYEES per branch:', (await exec('SELECT BRANCH_ID B, COUNT(*) C FROM EMPLOYEES GROUP BY BRANCH_ID ORDER BY 1')).rows);
});
await (await getPool()).close(0);
