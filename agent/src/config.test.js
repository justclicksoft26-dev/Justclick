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
