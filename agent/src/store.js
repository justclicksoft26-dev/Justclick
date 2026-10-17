import { DatabaseSync } from 'node:sqlite'; // built into Node 22.5+, nothing to compile or install

const pad = (n) => String(n).padStart(2, '0');
const fmtTs = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const shiftDays = (ts, days) => fmtTs(new Date(new Date(ts.replace(' ', 'T')).getTime() - days * 24 * 3600 * 1000));

/**
 * Local outbox: every punch read from the device is saved here first and flagged `sent` only after the
 * server accepted it. Nothing is lost if the server or the network is down, or if the device clears its log.
 *
 * Retention is measured from the newest punch we hold (not the clock): sent rows older than
 * `retainDays` before it are purged, and device punches older than that are not re-ingested, so a purged
 * row can never come back from the device as "new".
 */
export function openStore(file, { retainDays = 60 } = {}) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA busy_timeout = 15000'); // set first: two runs at once (service + a manual run) wait for each other instead of failing
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS punches (
    code TEXT NOT NULL,
    ts   TEXT NOT NULL,
    sent INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (code, ts)
  ) WITHOUT ROWID;
  CREATE INDEX IF NOT EXISTS punches_pending ON punches (sent, ts);`);

  const newest = db.prepare('SELECT MAX(ts) T FROM punches');
  const insert = db.prepare('INSERT OR IGNORE INTO punches (code, ts) VALUES (?, ?)');
  const pending = db.prepare('SELECT code, ts FROM punches WHERE sent = 0 ORDER BY ts, code LIMIT ?');
  const pendingCount = db.prepare('SELECT COUNT(*) C FROM punches WHERE sent = 0');
  const mark = db.prepare('UPDATE punches SET sent = 1 WHERE code = ? AND ts = ?');
  const purge = db.prepare('DELETE FROM punches WHERE sent = 1 AND ts < ?');

  const inTransaction = (fn) => {
    db.exec('BEGIN');
    try {
      const r = fn();
      db.exec('COMMIT');
      return r;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };

  return {
    /** Saves device punches that are not stored yet. Returns how many were new. */
    add(logs) {
      const top = newest.get().T;
      const floor = top ? shiftDays(top, retainDays) : '';
      return inTransaction(() => {
        let added = 0;
        for (const l of logs) if (!floor || l.ts >= floor) added += Number(insert.run(l.code, l.ts).changes);
        return added;
      });
    },
    /** Oldest punches the server has not confirmed yet. */
    pending: (limit) => pending.all(limit).map((r) => ({ code: r.code, ts: r.ts })),
    pendingCount: () => Number(pendingCount.get().C),
    markSent: (batch) =>
      inTransaction(() => {
        for (const p of batch) mark.run(p.code, p.ts);
      }),
    /** Drops old confirmed rows. Returns how many were removed. */
    purge() {
      const top = newest.get().T;
      return top ? Number(purge.run(shiftDays(top, retainDays)).changes) : 0;
    },
    close: () => db.close(),
  };
}
