// Demo data for trying the reports.  node src/seed-demo.js          -> add 3 demo employees + 30 days of punches
//                                    node src/seed-demo.js --clean  -> remove everything this script added
// Demo punches in ATT_EMP are tagged BRANCH_ID = 999 so they can be removed without touching real rows.
import { getPool, query, withTransaction } from './db.js';
import { Conflict, createEmployee, deleteEmployee } from './erp.js';
import { localToday } from './validation.js';

const TAG = 999;
const DAYS = 30;
const EMPLOYEES = [
  { code: '9001', name: 'أحمد علي', nationalId: '29001011234567', job: 'محاسب', weeklyOff: [5] },
  { code: '9002', name: 'منى حسن', nationalId: '29205051234567', job: 'سكرتيرة', weeklyOff: [5, 6] },
  { code: '9003', name: 'محمود سعيد', nationalId: '28803031234567', job: 'مهندس موقع', weeklyOff: [5] },
];

const pad = (n) => String(n).padStart(2, '0');
const addDays = (ymd, n) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const hm = (mins) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}:${pad(Math.floor(Math.random() * 60))}`;

async function clean() {
  const r = await query('DELETE FROM ATT_EMP WHERE BRANCH_ID = :t AND EMP_ID BETWEEN 9001 AND 9003', { t: TAG });
  console.log(`punches removed: ${r.rowsAffected}`);
  // posted actual times of the demo employees (created by the posting screen)
  const p = await query('DELETE FROM EMP_IO_TIMES WHERE EMP_ID BETWEEN 9001 AND 9003');
  console.log(`posted rows removed: ${p.rowsAffected}`);
  for (const e of EMPLOYEES) {
    const d = await deleteEmployee(e.code);
    console.log(`employee ${e.code}:`, !d.found ? 'not found' : d.blocked.length ? `kept, referenced by ${d.blocked}` : 'removed');
  }
}

async function seed() {
  await clean();
  const today = localToday();
  const hire = addDays(today, -DAYS - 10);
  for (const e of EMPLOYEES) {
    try {
      await createEmployee({
        code: e.code, name: e.name, nid: e.nationalId, job: e.job, hireDate: hire, status: 'ACTIVE',
        start: '09:00', end: '17:00', weeklyOff: e.weeklyOff, grace: 15,
      });
      console.log(`employee ${e.code} created`);
    } catch (err) {
      if (!(err instanceof Conflict)) throw err;
      console.log(`employee ${e.code} skipped:`, Object.values(err.errors).join(' / '));
    }
  }

  const rows = [];
  for (const e of EMPLOYEES) {
    for (let i = DAYS; i >= 1; i--) {
      const date = addDays(today, -i);
      if (e.weeklyOff.includes(new Date(`${date}T00:00:00Z`).getUTCDay())) continue;
      const roll = Math.random();
      if (roll < 0.07) continue; // absent
      const late = roll < 0.27;
      const inMin = late ? 9 * 60 + 16 + Math.floor(Math.random() * 35) : 8 * 60 + 45 + Math.floor(Math.random() * 30);
      rows.push({ emp: Number(e.code), t: `${date} ${hm(inMin)}`, flag: 'I' });
      if (roll > 0.97) continue; // forgot to check out
      rows.push({ emp: Number(e.code), t: `${date} ${hm(16 * 60 + 55 + Math.floor(Math.random() * 40))}`, flag: 'O' });
    }
  }

  await withTransaction(async ({ exec, execMany }) => {
    const meta = (await exec('SELECT COMPANY_CODE C, FISCAL_YEAR F FROM HR_SYS_INFO FETCH FIRST 1 ROW ONLY')).rows[0] ?? {};
    await execMany(
      `INSERT INTO ATT_EMP (EMP_ID, ATT_TIME, ATT_FLAG, COMPANY_CODE, FISCAL_YEAR, BRANCH_ID)
       VALUES (:emp, TO_DATE(:t,'YYYY-MM-DD HH24:MI:SS'), :flag, :c, :f, :b)`,
      rows.map((r) => ({ ...r, c: meta.C ?? null, f: meta.F ?? null, b: TAG })),
    );
  });
  console.log(`punches inserted: ${rows.length} (${addDays(today, -DAYS)} .. ${addDays(today, -1)})`);
}

await (process.argv.includes('--clean') ? clean() : seed());
await (await getPool()).close(0);
