/**
 * Turns the parsed agent.config.json into the shape the agent uses.
 *
 * One device (the original form, still supported):
 *   { "deviceIp": "192.168.1.201", "devicePort": 4370, ... }
 * Several devices read by this same computer:
 *   { "devices": [ { "name": "main gate", "ip": "192.168.1.201" }, { "ip": "192.168.1.202", "port": 4370 } ], ... }
 * When "devices" is present it wins and deviceIp / devicePort are ignored.
 */
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
  return { intervalMinutes: 5, retainDays: 60, ...c, devices: list, serverUrl: c.serverUrl.replace(/\/+$/, '') };
}
