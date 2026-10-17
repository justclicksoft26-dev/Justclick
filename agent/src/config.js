/**
 * Turns the parsed agent.config.json into the shape the agent uses.
 *
 * One device (the original form, still supported):
 *   { "deviceIp": "192.168.1.201", "devicePort": 4370, ... }
 * Several devices read by this same computer:
 *   { "devices": [ { "name": "main gate", "ip": "192.168.1.201" }, { "ip": "192.168.1.202", "port": 4370 } ], ... }
 * When "devices" is present it wins and deviceIp / devicePort are ignored.
 *
 * Optional:
 *   "agentName": "branch-1"          sent to the server with every request (default: the computer name)
 *   "schedule": { "start": "06:00", "end": "13:30", "idleIntervalMinutes": 60 }
 *       inside the window the agent pulls every intervalMinutes; outside it only every idleIntervalMinutes
 *       (default 60), and it always wakes up at the start and just after the end of the window.
 */
import os from 'node:os';

const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

/** Minutes to wait before the next pass. `now` is a Date in the computer's local time. */
export function nextWaitMinutes(cfg, now = new Date()) {
  const base = Math.max(1, Number(cfg.intervalMinutes) || 5);
  const sc = cfg.schedule;
  if (!sc) return base;
  const start = toMin(sc.start);
  const end = toMin(sc.end);
  const cur = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const inside = start <= end ? cur >= start && cur < end : cur >= start || cur < end; // overnight window
  const until = (target) => ((target - cur + 1440) % 1440) || 1440;
  if (inside) return Math.max(1, Math.min(base, Math.ceil(until(end)) + 1));
  return Math.max(1, Math.min(sc.idleIntervalMinutes, Math.ceil(until(start))));
}

export function normalizeConfig(c) {
  const fail = (m) => {
    throw new Error(`agent.config.json: ${m}`);
  };
  for (const k of ['serverUrl', 'apiKey']) if (!c[k]) fail(`"${k}" is required`);
  if (c.since && !/^\d{4}-\d{2}-\d{2}$/.test(c.since)) fail('"since" must look like 2026-10-01');

  const defaultPort = c.devicePort ?? 4370;
  let list;
  if (Array.isArray(c.devices) && c.devices.length) {
    list = c.devices.map((d, i) => {
      if (!d || typeof d.ip !== 'string' || !d.ip.trim()) fail(`devices[${i}] needs an "ip"`);
      return { name: String(d.name ?? d.ip).trim(), ip: d.ip.trim(), port: d.port ?? defaultPort };
    });
  } else if (c.deviceIp) {
    list = [{ name: String(c.deviceIp), ip: String(c.deviceIp), port: defaultPort }];
  } else {
    fail('"deviceIp" or "devices" is required');
  }

  const seen = new Set();
  for (const d of list) {
    const key = `${d.ip}:${d.port}`;
    if (seen.has(key)) fail(`device ${key} is listed twice`);
    seen.add(key);
  }
  let schedule = null;
  if (c.schedule) {
    const { start, end } = c.schedule;
    if (!HHMM.test(String(start)) || !HHMM.test(String(end)) || start === end) {
      fail('"schedule" needs "start" and "end" like "06:00" and "13:30" (two different times)');
    }
    const idle = c.schedule.idleIntervalMinutes ?? 60;
    if (!Number.isFinite(idle) || idle < 1) fail('"schedule.idleIntervalMinutes" must be a number of minutes, 1 or more');
    schedule = { start, end, idleIntervalMinutes: idle };
  }
  const agentName = String(c.agentName ?? '').trim().slice(0, 60) || os.hostname();
  return { intervalMinutes: 5, retainDays: 60, ...c, agentName, schedule, devices: list, serverUrl: c.serverUrl.replace(/\/+$/, '') };
}
