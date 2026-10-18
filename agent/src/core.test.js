import test from 'node:test';
import assert from 'node:assert/strict';
import { errorText, normalizeLogs, sinceFilter, syncOnce } from './core.js';
import { openStore } from './store.js';

const L = (code, ts) => ({ code, ts });
const day = (i) => `2026-10-${String(i).padStart(2, '0')} 09:00:00`;

test('normalizeLogs keeps numeric ids and formats local time', () => {
  const out = normalizeLogs([
    { deviceUserId: '101', recordTime: new Date(2026, 9, 1, 8, 58, 0) },
    { deviceUserId: 'abc', recordTime: new Date(2026, 9, 1, 9, 0, 0) },
    { deviceUserId: '102', recordTime: 'not a date' },
  ]);
  assert.deepEqual(out, [L('101', '2026-10-01 08:58:00')]);
});

test('first run saves everything locally and sends it in batches', async () => {
  const store = openStore(':memory:');
  const logs = Array.from({ length: 5 }, (_, i) => L('1', day(i + 1)));
  const batches = [];
  const r = await syncOnce({ fetchLogs: async () => logs, send: async (b) => (batches.push(b.length), { stored: b.length }), store, batchSize: 2 });
  assert.deepEqual(batches, [2, 2, 1]);
  assert.deepEqual([r.read, r.added, r.sent, r.stored, r.pending], [5, 5, 5, 5, 0]);
});

test('later runs send only punches that are new', async () => {
  const store = openStore(':memory:');
  const sent = [];
  const send = async (b) => (sent.push(...b), { stored: b.length });
  await syncOnce({ fetchLogs: async () => [L('1', day(1)), L('1', day(2))], send, store });
  sent.length = 0;
  const r = await syncOnce({ fetchLogs: async () => [L('1', day(1)), L('1', day(2)), L('2', day(3))], send, store });
  assert.deepEqual(sent, [L('2', day(3))]);
  assert.equal(r.added, 1);
});

test('server down: punches stay pending locally and go out on the next pass', async () => {
  const store = openStore(':memory:');
  const logs = [L('1', day(1)), L('1', day(2))];
  await assert.rejects(syncOnce({ fetchLogs: async () => logs, send: async () => { throw new Error('offline'); }, store }), /offline/);
  assert.equal(store.pendingCount(), 2);
  const sent = [];
  const r = await syncOnce({ fetchLogs: async () => logs, send: async (b) => (sent.push(...b), { stored: b.length }), store });
  assert.equal(sent.length, 2);
  assert.equal(r.pending, 0);
});

test('a batch that fails midway only keeps the unconfirmed part pending', async () => {
  const store = openStore(':memory:');
  const logs = Array.from({ length: 5 }, (_, i) => L('1', day(i + 1)));
  let calls = 0;
  await assert.rejects(syncOnce({ fetchLogs: async () => logs, send: async () => { if (++calls === 2) throw new Error('drop'); return { stored: 2 }; }, store, batchSize: 2 }), /drop/);
  assert.equal(store.pendingCount(), 3);
});

test('device unreachable: the backlog is still delivered and the device error is reported', async () => {
  const store = openStore(':memory:');
  store.add([L('1', day(1)), L('1', day(2))]);
  const sent = [];
  const r = await syncOnce({ fetchLogs: async () => { throw new Error('no route'); }, send: async (b) => (sent.push(...b), { stored: b.length }), store });
  assert.equal(sent.length, 2);
  assert.equal(r.deviceError.message, 'no route');
  assert.equal(r.read, 0);
});

test('device wipes its log: punches already saved locally are still delivered', async () => {
  const store = openStore(':memory:');
  await assert.rejects(syncOnce({ fetchLogs: async () => [L('1', day(1)), L('1', day(2))], send: async () => { throw new Error('offline'); }, store }));
  const sent = [];
  await syncOnce({ fetchLogs: async () => [], send: async (b) => (sent.push(...b), { stored: b.length }), store });
  assert.equal(sent.length, 2);
});

test('nothing on the device is not an error', async () => {
  const store = openStore(':memory:');
  const r = await syncOnce({ fetchLogs: async () => [], send: async () => ({}), store });
  assert.deepEqual([r.read, r.added, r.sent, r.stored, r.pending, r.deviceError], [0, 0, 0, 0, 0, null]);
});

test('retention: old confirmed rows are purged and are not re-ingested from the device', async () => {
  const store = openStore(':memory:', { retainDays: 10 });
  const old = L('1', '2026-01-01 09:00:00');
  const recent = L('1', '2026-06-01 09:00:00');
  const send = async (b) => ({ stored: b.length });
  await syncOnce({ fetchLogs: async () => [old, recent], send, store }); // first run takes everything
  const sent = [];
  const r = await syncOnce({ fetchLogs: async () => [old, recent], send: async (b) => (sent.push(...b), { stored: b.length }), store });
  assert.deepEqual(sent, []); // the purged old row did not come back as new
  assert.equal(r.added, 0);
});

test('since drops older punches and keeps the start day', () => {
  const logs = [L('1', '2026-09-30 23:59:59'), L('1', '2026-10-01 00:00:00'), L('1', '2026-10-02 08:00:00')];
  assert.deepEqual(sinceFilter(logs, '2026-10-01').map((l) => l.ts), ['2026-10-01 00:00:00', '2026-10-02 08:00:00']);
  assert.equal(sinceFilter(logs, undefined).length, 3);
});

test('errorText explains ZKError-like objects, plain errors and strings', () => {
  const zk = { err: { message: 'connect ECONNREFUSED', code: 'ECONNREFUSED' }, command: '[TCP] CONNECT', ip: '10.0.0.5', toast: () => 'IP of the device is refused' };
  assert.match(errorText(zk), /refused.*ECONNREFUSED.*10\.0\.0\.5/);
  assert.equal(errorText(new Error('x')), 'x');
  assert.equal(errorText('boom'), 'boom');
});

test('several devices: all are read, one failing does not stop the others, counts are per device', async () => {
  const store = openStore(':memory:');
  const sent = [];
  const devices = [
    { name: 'A', fetch: async () => [L('1', day(1)), L('2', day(1))] },
    { name: 'B', fetch: async () => { throw new Error('unreachable'); } },
    { name: 'C', fetch: async () => [L('3', day(2))] },
  ];
  const r = await syncOnce({ devices, send: async (b) => (sent.push(...b), { stored: b.length }), store });
  assert.equal(sent.length, 3);
  assert.deepEqual(r.devices.map((d) => [d.name, d.read, d.added, !!d.error]), [['A', 2, 2, false], ['B', 0, 0, true], ['C', 1, 1, false]]);
  assert.equal(r.deviceError.message, 'unreachable');
  assert.equal(r.read, 3);
});

test('several devices: the same punch seen on two devices is stored and sent once', async () => {
  const store = openStore(':memory:');
  const sent = [];
  const same = async () => [L('1', day(1))];
  const r = await syncOnce({ devices: [{ name: 'A', fetch: same }, { name: 'B', fetch: same }], send: async (b) => (sent.push(...b), { stored: b.length }), store });
  assert.equal(sent.length, 1);
  assert.deepEqual(r.devices.map((d) => d.added), [1, 0]);
});
