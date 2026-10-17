import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from './config.js';

const base = { serverUrl: 'https://s.example.com/', apiKey: 'k' };

test('the original single-device config keeps working unchanged', () => {
  const c = normalizeConfig({ ...base, deviceIp: '192.168.1.201', devicePort: 4371, intervalMinutes: 7 });
  assert.deepEqual(c.devices, [{ name: '192.168.1.201', ip: '192.168.1.201', port: 4371 }]);
  assert.equal(c.intervalMinutes, 7);
  assert.equal(c.serverUrl, 'https://s.example.com');
  assert.equal(c.retainDays, 60);
  assert.equal(normalizeConfig({ ...base, deviceIp: '10.0.0.1' }).devices[0].port, 4370);
});

test('several devices: names default to the ip, port defaults to devicePort or 4370', () => {
  const c = normalizeConfig({ ...base, devicePort: 4380, devices: [{ ip: '10.0.0.1' }, { name: 'gate', ip: '10.0.0.2', port: 4370 }] });
  assert.deepEqual(c.devices, [
    { name: '10.0.0.1', ip: '10.0.0.1', port: 4380 },
    { name: 'gate', ip: '10.0.0.2', port: 4370 },
  ]);
});

test('"devices" wins over deviceIp when both are present', () => {
  const c = normalizeConfig({ ...base, deviceIp: '1.1.1.1', devices: [{ ip: '2.2.2.2' }] });
  assert.deepEqual(c.devices.map((d) => d.ip), ['2.2.2.2']);
});

test('bad configs are rejected with a clear message', () => {
  assert.throws(() => normalizeConfig({ ...base }), /"deviceIp" or "devices" is required/);
  assert.throws(() => normalizeConfig({ apiKey: 'k', deviceIp: '1.1.1.1' }), /"serverUrl" is required/);
  assert.throws(() => normalizeConfig({ serverUrl: 'x', deviceIp: '1.1.1.1' }), /"apiKey" is required/);
  assert.throws(() => normalizeConfig({ ...base, devices: [{ name: 'a' }] }), /devices\[0\] needs an "ip"/);
  assert.throws(() => normalizeConfig({ ...base, devices: [{ ip: '1.1.1.1' }, { ip: '1.1.1.1' }] }), /listed twice/);
  assert.throws(() => normalizeConfig({ ...base, deviceIp: '1.1.1.1', since: '1/10/2026' }), /"since"/);
});

import { nextWaitMinutes } from './config.js';

const sched = (extra = {}) => normalizeConfig({ ...base, deviceIp: '10.0.0.1', schedule: { start: '06:00', end: '13:30', idleIntervalMinutes: 60 }, ...extra });
const at = (c, h, m, s = 0) => nextWaitMinutes(c, new Date(2026, 9, 17, h, m, s));

test('without a schedule the pull interval is used all day', () => {
  const c = normalizeConfig({ ...base, deviceIp: '10.0.0.1', intervalMinutes: 7 });
  assert.equal(c.schedule, null);
  assert.equal(at(c, 3, 0), 7);
  assert.equal(at(c, 9, 0), 7);
});

test('schedule: inside the window it pulls every intervalMinutes, outside every idleIntervalMinutes', () => {
  const c = sched();
  assert.equal(at(c, 8, 0), 5);
  assert.equal(at(c, 6, 0), 5);
  assert.equal(at(c, 14, 0), 60);
  assert.equal(at(c, 3, 0), 60);
});

test('schedule: it wakes up for the start of the window and one minute after its end', () => {
  const c = sched();
  assert.equal(at(c, 5, 30), 30); // 30 min to the start, not 60
  assert.equal(at(c, 5, 59), 1);
  assert.equal(at(c, 13, 28), 3); // one last pass right after 13:30
  assert.equal(at(c, 13, 30), 60);
});

test('schedule: a window that crosses midnight works', () => {
  const c = sched({ schedule: { start: '22:00', end: '06:00', idleIntervalMinutes: 30 } });
  assert.equal(at(c, 23, 0), 5);
  assert.equal(at(c, 2, 0), 5);
  assert.equal(at(c, 12, 0), 30);
  assert.equal(at(c, 21, 50), 10);
});

test('bad schedules and the agent name', () => {
  assert.throws(() => sched({ schedule: { start: '6:00', end: '13:30' } }), /"schedule"/);
  assert.throws(() => sched({ schedule: { start: '06:00', end: '06:00' } }), /"schedule"/);
  assert.throws(() => sched({ schedule: { start: '06:00', end: '13:30', idleIntervalMinutes: 0 } }), /idleIntervalMinutes/);
  assert.equal(sched({ schedule: { start: '06:00', end: '13:30' } }).schedule.idleIntervalMinutes, 60);
  assert.equal(sched({ agentName: 'branch-1' }).agentName, 'branch-1');
  assert.ok(sched().agentName.length > 0);
});

test('apiPath: default is the Node server path; a custom path gets one leading slash', () => {
  assert.equal(normalizeConfig({ ...base, deviceIp: '10.0.0.1' }).apiPath, '/api/agent/punches');
  assert.equal(normalizeConfig({ ...base, deviceIp: '10.0.0.1', apiPath: 'attendance/punches' }).apiPath, '/attendance/punches');
  assert.equal(normalizeConfig({ ...base, deviceIp: '10.0.0.1', apiPath: '/attendance/punches' }).apiPath, '/attendance/punches');
});
