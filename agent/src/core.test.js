import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLogs, syncOnce } from './core.js';

const L = (code, ts) => ({ code, ts });

test('normalizeLogs keeps numeric ids and formats local time', () => {
  const out = normalizeLogs([
    { deviceUserId: '101', recordTime: new Date(2026, 9, 1, 8, 58, 0) },
    { deviceUserId: 'abc', recordTime: new Date(2026, 9, 1, 9, 0, 0) },
    { deviceUserId: '102', recordTime: 'not a date' },
  ]);
  assert.deepEqual(out, [L('101', '2026-10-01 08:58:00')]);
});

test('first run sends everything in batches and records the newest timestamp', async () => {
  const logs = Array.from({ length: 5 }, (_, i) => L('1', `2026-10-0${i + 1} 09:00:00`));
  const batches = [];
  const state = {};
  const r = await syncOnce({ fetchLogs: async () => logs, send: async (b) => (batches.push(b.length), { stored: b.length }), state, batchSize: 2 });
  assert.deepEqual(batches, [2, 2, 1]);
  assert.equal(r.stored, 5);
  assert.equal(state.lastTs, '2026-10-05 09:00:00');
});

test('later runs only send what is newer than lastTs minus the overlap', async () => {
  const logs = [L('1', '2026-10-01 09:00:00'), L('1', '2026-10-05 09:00:00'), L('1', '2026-10-07 09:00:00')];
  const sent = [];
  const state = { lastTs: '2026-10-05 09:00:00' };
  await syncOnce({ fetchLogs: async () => logs, send: async (b) => (sent.push(...b), { stored: 0 }), state, overlapMs: 24 * 3600 * 1000 });
  assert.deepEqual(sent.map((p) => p.ts), ['2026-10-05 09:00:00', '2026-10-07 09:00:00']);
  assert.equal(state.lastTs, '2026-10-07 09:00:00');
});

test('a failed batch leaves state untouched so the next pass retries', async () => {
  const logs = [L('1', '2026-10-01 09:00:00'), L('1', '2026-10-02 09:00:00')];
  const state = { lastTs: '2026-09-01 00:00:00' };
  await assert.rejects(
    syncOnce({ fetchLogs: async () => logs, send: async () => { throw new Error('offline'); }, state }),
    /offline/,
  );
  assert.equal(state.lastTs, '2026-09-01 00:00:00');
});

test('nothing on the device is not an error', async () => {
  const state = {};
  const r = await syncOnce({ fetchLogs: async () => [], send: async () => ({}), state });
  assert.deepEqual(r, { read: 0, sent: 0, stored: 0 });
  assert.equal(state.lastTs, undefined);
});
