// Read-only check: talks to the devices and the server but stores and sends no punches.
//   npm run probe
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ZKLib from 'node-zklib';
import { normalizeConfig } from './config.js';
import { errorText, normalizeLogs } from './core.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ok = (m) => console.log(`[OK]   ${m}`);
const bad = (m) => console.log(`[FAIL] ${m}`);
const info = (m) => console.log(`       ${m}`);

let cfg;
try {
  cfg = normalizeConfig(JSON.parse(fs.readFileSync(path.join(root, 'agent.config.json'), 'utf8')));
  ok(`agent.config.json read (${cfg.devices.length} device(s), server ${cfg.serverUrl})`);
} catch (e) {
  bad(e.message);
  process.exit(1); // nothing is open yet, safe to exit right away
}

let failed = false;

// ---- devices ----
for (const dev of cfg.devices) {
  console.log(`\n--- device ${dev.name} (${dev.ip}:${dev.port}) ---`);
  const zk = new ZKLib(dev.ip, dev.port, 10000, 4000);
  try {
    await zk.createSocket();
    ok('connected to the device');
    try {
      const i = await zk.getInfo();
      info(`users on device: ${i.userCounts}, records: ${i.logCounts}, capacity: ${i.logCapacity}`);
    } catch {
      info('device info not available (not an error)');
    }
    const raw = (await zk.getAttendances()).data ?? [];
    const logs = normalizeLogs(raw);
    ok(`read ${raw.length} attendance records, ${logs.length} usable (numeric user id + valid time)`);
    if (raw.length > logs.length) console.log(`[WARN] ${raw.length - logs.length} records skipped (non-numeric user id or bad time)`);
    if (logs.length) {
      const sorted = [...logs].sort((a, b) => (a.ts < b.ts ? -1 : 1));
      info(`oldest punch: ${sorted[0].ts}`);
      info(`newest punch: ${sorted.at(-1).ts}   (PC time now: ${new Date().toLocaleString()})`);
      info('check that the newest punch matches the real last punch, otherwise the device clock is wrong');
      info(`distinct employee codes: ${new Set(logs.map((l) => l.code)).size}`);
      info('last 5 punches:');
      for (const l of sorted.slice(-5)) info(`  code ${l.code}  ${l.ts}`);
    }
  } catch (e) {
    failed = true;
    bad(`device ${dev.name}: ${errorText(e)}`);
    info('check: IP/port, same network as the device, Comm Key, no other program connected to it');
  } finally {
    await zk.disconnect().catch(() => {});
  }
}

// ---- server (no punches are sent: an empty list is rejected with 400 after the key check) ----
console.log('\n--- server ---');
const base = cfg.serverUrl;
try {
  const r = await fetch(`${base}/api/auth/me`, { signal: AbortSignal.timeout(15_000) });
  if (r.status === 401) ok('server reachable');
  else info(`server answered ${r.status} on /api/auth/me (expected 401)`);
} catch (e) {
  failed = true;
  bad(`server unreachable: ${e.cause?.code ?? e.message}`);
}
try {
  const r = await fetch(`${base}/api/agent/punches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Agent-Key': cfg.apiKey },
    body: JSON.stringify({ punches: [] }),
    signal: AbortSignal.timeout(15_000),
  });
  if (r.status === 400) ok('apiKey accepted by the server');
  else if (r.status === 401) {
    failed = true;
    bad('apiKey rejected (must equal AGENT_API_KEY in the server .env, and the server must be restarted after adding it)');
  } else info(`unexpected answer ${r.status} from /api/agent/punches`);
} catch (e) {
  failed = true;
  bad(`apiKey check failed: ${e.cause?.code ?? e.message}`);
}

console.log(failed ? '\nResult: problems found, fix them before running the agent.' : '\nResult: ready. Next: npm run once');
process.exitCode = failed ? 1 : 0;
