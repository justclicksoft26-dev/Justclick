// Puts every employee on the 06:00 - 13:30 shift and sets the late grace to 14 min (kept for reference; up to 15 min late is never counted as late).
//   node src/set-default-shift.js               -> effective from today (older shift history is kept)
//   node src/set-default-shift.js 2026-10-01    -> effective from that date
import { withTransaction } from './db.js';
import { ensureShift } from './erp.js';
import { localToday } from './validation.js';

const START = '06:00';
const END = '13:30';
const GRACE = 14;
const from = process.argv[2] ?? localToday();
if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) throw new Error('date must be YYYY-MM-DD');

await withTransaction(async ({ exec }) => {
  const shift = await ensureShift(exec, START, END);
  const bind = { s: shift, d: from };

  // assignments that start on/after the date: just switch the shift
  const a = await exec(`UPDATE SHIFT_EMP SET SHIFT_ID = :s WHERE SHIFT_DATE_FROM >= TO_DATE(:d,'YYYY-MM-DD') AND SHIFT_DATE_TO >= TO_DATE(:d,'YYYY-MM-DD')`, bind);

  // assignments running across the date: close them the day before and open a new one from the date
  const running = (await exec(
    `SELECT SHIFT_EMP_SQ SQ, EMP_ID, TO_CHAR(SHIFT_DATE_TO,'YYYY-MM-DD') T FROM SHIFT_EMP
      WHERE SHIFT_DATE_FROM < TO_DATE(:d,'YYYY-MM-DD') AND SHIFT_DATE_TO >= TO_DATE(:d,'YYYY-MM-DD') AND SHIFT_ID <> :s`, bind,
  )).rows;
  for (const r of running) {
    await exec(`UPDATE SHIFT_EMP SET SHIFT_DATE_TO = TO_DATE(:d,'YYYY-MM-DD') - 1 WHERE SHIFT_EMP_SQ = :sq`, { d: from, sq: r.SQ });
    await exec(
      `INSERT INTO SHIFT_EMP (SHIFT_EMP_SQ, SHIFT_ID, EMP_ID, SHIFT_DATE_FROM, SHIFT_DATE_TO)
       VALUES (SHIFT_EMP_SEQ.NEXTVAL, :s, :e, TO_DATE(:d,'YYYY-MM-DD'), TO_DATE(:t,'YYYY-MM-DD'))`,
      { s: shift, e: r.EMP_ID, d: from, t: r.T },
    );
  }

  // employees with no assignment covering the date
  const none = await exec(
    `INSERT INTO SHIFT_EMP (SHIFT_EMP_SQ, SHIFT_ID, EMP_ID, SHIFT_DATE_FROM, SHIFT_DATE_TO)
     SELECT SHIFT_EMP_SEQ.NEXTVAL, :s, e.EMP_ID, TO_DATE(:d,'YYYY-MM-DD'), DATE '2099-12-31' FROM EMPLOYEES e
      WHERE NOT EXISTS (SELECT 1 FROM SHIFT_EMP x WHERE x.EMP_ID = e.EMP_ID AND x.SHIFT_DATE_TO >= TO_DATE(:d,'YYYY-MM-DD'))`, bind,
  );

  const g = await exec(
    `MERGE INTO ATTM_EMP_SETTING g USING (SELECT EMP_ID FROM EMPLOYEES) e ON (g.EMP_ID = e.EMP_ID)
     WHEN MATCHED THEN UPDATE SET g.GRACE_MIN = :g
     WHEN NOT MATCHED THEN INSERT (EMP_ID, GRACE_MIN) VALUES (e.EMP_ID, :g)`, { g: GRACE },
  );
  console.log(`shift ${START}-${END} from ${from}: switched ${a.rowsAffected}, split ${running.length}, added ${none.rowsAffected}; grace set for ${g.rowsAffected}`);
});
process.exit(0);
