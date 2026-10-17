import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ZKLib from 'node-zklib';
import { nextWaitMinutes, normalizeConfig } from './config.js';
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
  return normalizeConfig(JSON.parse(fs.readFileSync(configPath, 'utf8')));
}

async function readDevice(dev, cfg) {
  const zk = new ZKLib(dev.ip, dev.port, 10000, 4000);
  try {
    await zk.createSocket();
    const res = await zk.getAttendances();
    // node-zklib returns whatever it received plus `err` when the transfer broke off midway
    if (res.err) log(`device ${dev.name}: read incomplete (${errorText(res.err)}): got ${res.data?.length ?? 0} records, the rest will come on a later pass`);
    return sinceFilter(normalizeLogs(res.data), cfg.since);
  } finally {
    await zk.disconnect().catch(() => {});
  }
}

async function sendBatch(cfg, punches) {
  const res = await fetch(`${cfg.serverUrl}${cfg.apiPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Agent-Key': cfg.apiKey, 'X-Agent-Name': encodeURIComponent(cfg.agentName) },
    body: JSON.stringify({ punches }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`server ${res.status}: ${body.message ?? 'error'}`);
  return body;
}

/** Returns true when every device was read and delivery worked. */
async function pass(cfg = loadConfig()) {
  const store = openStore(dbPath, { retainDays: cfg.retainDays });
  try {
    const r = await syncOnce({
      devices: cfg.devices.map((d) => ({ name: d.name, fetch: () => readDevice(d, cfg) })),
      send: (batch) => sendBatch(cfg, batch),
      store,
    });
    const failed = r.devices.filter((d) => d.error);
    for (const d of failed) log(`device ${d.name} failed: ${errorText(d.error)}`);
    const many = r.devices.length > 1 ? `devices ${r.devices.length - failed.length}/${r.devices.length}, ` : '';
    log(`${failed.length ? 'partial' : 'ok'}: ${many}read ${r.read}, new ${r.added}, sent ${r.sent}, stored ${r.stored}, waiting ${r.pending}`);
    return failed.length === 0;
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
      const cfg = loadConfig();
      wait = nextWaitMinutes(cfg);
      await pass(cfg);
      wait = nextWaitMinutes(cfg);
      if (cfg.schedule && wait > cfg.intervalMinutes) {
        log(`outside ${cfg.schedule.start}-${cfg.schedule.end}: next pass in ${wait} min`);
      }
    } catch (e) {
      log(`failed: ${errorText(e)} (punches stay saved locally, will retry)`);
    }
    setTimeout(loop, Math.max(1, wait) * 60_000);
  };
  loop();
}
