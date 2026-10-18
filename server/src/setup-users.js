// One-off: leaves a single admin (user "1", IS_ADMIN = 1) in ACC_USERS, removes the other users together with
// their rows in the user-configuration tables, and creates one login per branch from BRANCH{n}_USER/PASS in .env.
//   node src/setup-users.js
// Everything it deletes is first written to server/backups/ so it can be restored. One transaction.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTransaction, getPool } from './db.js';

const KEEP = '1';
// FK children of ACC_USERS plus the per-user permission/config tables. Logs and transaction tables are left alone.
const RELATED = ['USERS_CASHES', 'CASH_TRANS_HEAD', 'CASH_REQUEST_HEAD', 'ACC_USERS_STORES', 'USERS_BRNACHES', 'PRFW_USER_ACCESS', 'DEVICE_AUTH'];

const branches = [1, 2].map((id) => ({ id, user: process.env[`BRANCH${id}_USER`], pass: process.env[`BRANCH${id}_PASS`] }));
if (branches.some((b) => !b.user || !b.pass)) throw new Error('BRANCH1_USER/PASS and BRANCH2_USER/PASS must be set in .env');

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../backups');
fs.mkdirSync(dir, { recursive: true });

await withTransaction(async ({ exec }) => {
  const keep = (await exec('SELECT * FROM ACC_USERS WHERE USER_NAME = :u', { u: KEEP })).rows[0];
  if (!keep) throw new Error(`user ${KEEP} not found`);
  if (keep.IS_ADMIN !== 1) throw new Error(`user ${KEEP} is not IS_ADMIN = 1`);

  const backup = { at: new Date().toISOString(), ACC_USERS: (await exec('SELECT * FROM ACC_USERS WHERE USER_NAME <> :u', { u: KEEP })).rows };
  const where = 'WHERE USER_NAME <> :u';
  for (const t of RELATED) {
    const cols = (await exec('SELECT 1 FROM USER_TAB_COLUMNS WHERE TABLE_NAME = :t AND COLUMN_NAME = \'USER_NAME\'', { t })).rows.length;
    if (!cols) { console.log(t, ': no USER_NAME column, skipped'); continue; }
    backup[t] = (await exec(`SELECT * FROM ${t} ${where}`, { u: KEEP })).rows;
    const r = await exec(`DELETE FROM ${t} ${where}`, { u: KEEP });
    console.log(t, ': deleted', r.rowsAffected);
  }
  fs.writeFileSync(path.join(dir, `users-${Date.now()}.json`), JSON.stringify(backup, null, 1));

  const del = await exec('DELETE FROM ACC_USERS WHERE USER_NAME <> :u', { u: KEEP });
  console.log('ACC_USERS: deleted', del.rowsAffected);

  for (const b of branches) {
    await exec(
      `INSERT INTO ACC_USERS (USER_NAME, PASSWORD, REAL_NAME, USER_TYPE, SYSTEM_ENABLE, IS_ADMIN, BRANCH_ID, COMPANY_CODE, FISCAL_YEAR)
       VALUES (:u, :p, :n, 1, 'Y', 0, :b, :c, :f)`,
      { u: b.user, p: b.pass, n: `مستخدم فرع ${b.id}`, b: b.id, c: keep.COMPANY_CODE, f: keep.FISCAL_YEAR },
    );
  }
  console.log((await exec('SELECT USER_NAME, USER_TYPE, IS_ADMIN, BRANCH_ID FROM ACC_USERS ORDER BY USER_NAME')).rows);
});
await (await getPool()).close(0);
