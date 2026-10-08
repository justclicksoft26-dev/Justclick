const pad = (n) => String(n).padStart(2, '0');

export const fmtTs = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

const shiftTs = (ts, ms) => fmtTs(new Date(new Date(ts.replace(' ', 'T')).getTime() + ms));

/** Device log entries -> [{ code, ts }], keeping only numeric user ids with a valid time. */
export function normalizeLogs(logs) {
  const out = [];
  for (const l of logs ?? []) {
    const code = String(l.deviceUserId ?? '').trim();
    const t = l.recordTime ? new Date(l.recordTime) : null;
    if (/^\d{1,9}$/.test(code) && t && !Number.isNaN(t.getTime())) out.push({ code, ts: fmtTs(t) });
  }
  return out;
}

/**
 * One sync pass. Reads the device, sends what is newer than the last successful sync (minus an overlap
 * window, the server drops duplicates), and only then advances state.lastTs. If any batch fails the
 * error propagates and state is untouched, so the next pass simply retries.
 *
 *   fetchLogs(): Promise<[{ code, ts }]>      send(batch): Promise<{ stored }>
 */
export async function syncOnce({ fetchLogs, send, state, batchSize = 1000, overlapMs = 24 * 3600 * 1000 }) {
  const logs = await fetchLogs();
  const since = state.lastTs ? shiftTs(state.lastTs, -overlapMs) : '';
  const fresh = logs.filter((l) => l.ts >= since);
  let stored = 0;
  for (let i = 0; i < fresh.length; i += batchSize) {
    const r = await send(fresh.slice(i, i + batchSize));
    stored += r?.stored ?? 0;
  }
  const newest = logs.reduce((m, l) => (l.ts > m ? l.ts : m), state.lastTs ?? '');
  if (newest) state.lastTs = newest;
  return { read: logs.length, sent: fresh.length, stored };
}
