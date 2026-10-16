// Demo data for trying the reports.  node src/seed-demo.js          -> add 3 demo employees + 30 days of punches
//                                    node src/seed-demo.js --clean  -> remove everything this script added (also: npm run db:demo-clean)
// Demo punches in ATT_EMP are tagged BRANCH_ID = 999 so they can be removed without touching real rows.
import { getPool, query, withTransaction } from './db.js';
import { Conflict, createEmployee, deleteEmployee } from './erp.js';
import { postActualTimes } from './posting.js';
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
        start: '06:00', end: '13:30', weeklyOff: e.weeklyOff, grace: 14,
      });
      console.log(`employee ${e.code} created`);
    } catch (err) {
      if (!(err instanceof Conflict)) throw err;
      console.log(`employee ${e.code} skipped:`, Object.values(err.errors).join(' / '));
    }
  }

  // One scenario per working day, cycled with a different offset per employee so every case shows up:
  // [minutes after the 06:00 shift start, or 'absent' / 'noout']. Covers every tier edge of the late rule.
  const SCENARIOS = [-10, 0, 14, 15, 25, 35, 15, 36, 45, 55, 56, 70, 90, 20, 91, 120, 'absent', 'noout', 30, 40, 60, 5];
  const rows = [];
  EMPLOYEES.forEach((e, ei) => {
    let k = ei * 7;
    for (let i = DAYS; i >= 1; i--) {
      const date = addDays(today, -i);
      if (e.weeklyOff.includes(new Date(`${date}T00:00:00Z`).getUTCDay())) continue;
      const sc = SCENARIOS[k++ % SCENARIOS.length];
      if (sc === 'absent') continue;
      const inMin = 6 * 60 + (sc === 'noout' ? 0 : sc);
      rows.push({ emp: Number(e.code), t: `${date} ${pad(Math.floor(inMin / 60))}:${pad(inMin % 60)}:${pad(10 + (k % 40))}`, flag: 'I' });
      if (sc === 'noout') continue; // forgot to check out
      rows.push({ emp: Number(e.code), t: `${date} 13:${pad(35 + (k % 20))}:00`, flag: 'O' });
    }
  });

  await withTransaction(async ({ exec, execMany }) => {
    const meta = (await exec('SELECT COMPANY_CODE C, FISCAL_YEAR F FROM HR_SYS_INFO FETCH FIRST 1 ROW ONLY')).rows[0] ?? {};
    await execMany(
      `INSERT INTO ATT_EMP (EMP_ID, ATT_TIME, ATT_FLAG, COMPANY_CODE, FISCAL_YEAR, BRANCH_ID)
       VALUES (:emp, TO_DATE(:t,'YYYY-MM-DD HH24:MI:SS'), :flag, :c, :f, :b)`,
      rows.map((r) => ({ ...r, c: meta.C ?? null, f: meta.F ?? null, b: TAG })),
    );
  });
  console.log(`punches inserted: ${rows.length} (${addDays(today, -DAYS)} .. ${addDays(today, -1)})`);
  const post = await postActualTimes({ from: hire, to: addDays(today, -1), emps: EMPLOYEES.map((e) => Number(e.code)) });
  console.log(`posted: ${post.posted}/${post.employees}`, post.skipped.length ? post.skipped : '');
}

await (process.argv.includes('--clean') ? clean() : seed());
await (await getPool()).close(0);
