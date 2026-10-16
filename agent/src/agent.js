import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ZKLib from 'node-zklib';
import { errorText, normalizeLogs, sinceFilter, syncOnce } from './core.js';
import { openStore } from './store.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(root, 'agent.config.json');
const dbPath = path.join(root, 'agent.db');
const logDir = path.join(root, 'logs');
const logFile = path.join(logDir, 'agent.log');

fs.mkdirSync(logDir, { recursive: true });

function log(msg) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  try {
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > 5 * 1024 * 1024) fs.renameSync(logFile, `${logFile}.old`);
    fs.appendFileSync(logFile, `${line}\n`);
  } catch {
    // logging must never stop the agent
  }
}

function loadConfig() {
  const c = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  for (const k of ['deviceIp', 'serverUrl', 'apiKey']) if (!c[k]) throw new Error(`agent.config.json: "${k}" is required`);
  if (c.since && !/^\d{4}-\d{2}-\d{2}$/.test(c.since)) throw new Error('agent.config.json: "since" must look like 2026-10-01');
  return { devicePort: 4370, intervalMinutes: 5, retainDays: 60, ...c, serverUrl: c.serverUrl.replace(/\/+$/, '') };
}

async function readDevice(cfg) {
  const zk = new ZKLib(cfg.deviceIp, cfg.devicePort, 10000, 4000);
  try {
    await zk.createSocket();
    const res = await zk.getAttendances();
    // node-zklib returns whatever it received plus `err` when the transfer broke off midway
    if (res.err) log(`device read incomplete (${errorText(res.err)}): got ${res.data?.length ?? 0} records, the rest will come on a later pass`);
    return sinceFilter(normalizeLogs(res.data), cfg.since);
  } finally {
    await zk.disconnect().catch(() => {});
  }
}

async function sendBatch(cfg, punches) {
  const res = await fetch(`${cfg.serverUrl}/api/agent/punches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Agent-Key': cfg.apiKey },
    body: JSON.stringify({ punches }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`server ${res.status}: ${body.message ?? 'error'}`);
  return body;
}

/** Returns true when both halves worked (device read and server delivery). */
async function pass() {
  const cfg = loadConfig();
  const store = openStore(dbPath, { retainDays: cfg.retainDays });
  try {
    const r = await syncOnce({
      fetchLogs: () => readDevice(cfg),
      send: (batch) => sendBatch(cfg, batch),
      store,
    });
    if (r.deviceError) log(`device failed: ${errorText(r.deviceError)}`);
    log(`${r.deviceError ? 'partial' : 'ok'}: read ${r.read}, new ${r.added}, sent ${r.sent}, stored ${r.stored}, waiting ${r.pending}`);
    return !r.deviceError;
  } finally {
    store.close();
  }
}

if (process.argv.includes('--once')) {
  pass()
    .then((ok) => {
      if (!ok) process.exitCode = 1;
    })
    .catch((e) => {
      log(`failed: ${errorText(e)} (punches stay saved locally and will be sent on the next pass)`);
      process.exitCode = 1;
    });
} else {
  log('agent started');
  const loop = async () => {
    let wait = 5;
    try {
      wait = loadConfig().intervalMinutes;
      await pass();
    } catch (e) {
      log(`failed: ${errorText(e)} (punches stay saved locally, will retry)`);
    }
    setTimeout(loop, Math.max(1, wait) * 60_000);
  };
  loop();
}
