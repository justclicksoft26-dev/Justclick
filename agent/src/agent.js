import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ZKLib from 'node-zklib';
import { normalizeLogs, syncOnce } from './core.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(root, 'agent.config.json');
const statePath = path.join(root, 'agent.state.json');
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
  return { devicePort: 4370, intervalMinutes: 5, ...c, serverUrl: c.serverUrl.replace(/\/+$/, '') };
}

const loadState = () => {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return {};
  }
};
const saveState = (s) => fs.writeFileSync(statePath, JSON.stringify(s));

async function readDevice(cfg) {
  const zk = new ZKLib(cfg.deviceIp, cfg.devicePort, 10000, 4000);
  try {
    await zk.createSocket();
    return normalizeLogs((await zk.getAttendances()).data);
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

async function pass() {
  const cfg = loadConfig();
  const state = loadState();
  const r = await syncOnce({
    fetchLogs: () => readDevice(cfg),
    send: (batch) => sendBatch(cfg, batch),
    state,
  });
  saveState(state);
  log(`ok: read ${r.read}, sent ${r.sent}, stored ${r.stored}`);
}

if (process.argv.includes('--once')) {
  pass().catch((e) => {
    log(`failed: ${e.message}`);
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
      log(`failed: ${e.message} (will retry)`);
    }
    setTimeout(loop, Math.max(1, wait) * 60_000);
  };
  loop();
}
