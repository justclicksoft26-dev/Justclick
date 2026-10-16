const pad = (n) => String(n).padStart(2, '0');

export const fmtTs = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

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

/** Drops punches before `since` (YYYY-MM-DD). No `since` keeps everything. */
export const sinceFilter = (logs, since) => (since ? logs.filter((l) => l.ts >= `${since} 00:00:00`) : logs);

/** Readable text for any thrown value (node-zklib rejects with a ZKError that is not an Error). */
export function errorText(e) {
  if (typeof e?.toast === 'function') {
    const where = [e.command, e.ip].filter(Boolean).join(' ');
    const code = e.err?.code ? ` [${e.err.code}]` : '';
    return `${e.toast()}${code}${where ? ` (${where})` : ''}`;
  }
  return e?.message ?? e?.err?.message ?? String(e);
}

/**
 * One sync pass, in two independent halves:
 *   1. read the device and save new punches into the local store;
 *   2. send everything the server has not confirmed yet, oldest first, and mark each batch only after
 *      the server accepted it.
 * The halves do not depend on each other: if the device cannot be read the backlog is still sent, and if
 * the server is down the punches stay safe locally (a send error propagates, nothing is marked).
 *
 *   fetchLogs(): Promise<[{ code, ts }]>      send(batch): Promise<{ stored }>
 *   store: { add, pending, pendingCount, markSent, purge }
 */
export async function syncOnce({ fetchLogs, send, store, batchSize = 1000 }) {
  let read = 0;
  let added = 0;
  let deviceError = null;
  try {
    const logs = await fetchLogs();
    read = logs.length;
    added = store.add(logs);
  } catch (e) {
    deviceError = e;
  }

  let sent = 0;
  let stored = 0;
  for (;;) {
    const batch = store.pending(batchSize);
    if (!batch.length) break;
    const r = await send(batch);
    store.markSent(batch);
    sent += batch.length;
    stored += r?.stored ?? 0;
  }
  store.purge();
  return { read, added, sent, stored, pending: store.pendingCount(), deviceError };
}
