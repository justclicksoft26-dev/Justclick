// Pulls every attendance record from a device exactly as it is and writes it to a CSV/text file.
// No server, no database, nothing is sent. Use it to prove the connection to the device works.
//
//   npm run dump -- 192.168.1.201            (port 4370)
//   npm run dump -- 192.168.1.201 4370 out.csv
//   npm run dump                             (every device listed in agent.config.json)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ZKLib from 'node-zklib';
import { normalizeConfig } from './config.js';
import { errorText, fmtTs } from './core.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [ipArg, portArg, outArg] = process.argv.slice(2);

let devices;
if (ipArg) {
  devices = [{ name: ipArg, ip: ipArg, port: Number(portArg) || 4370 }];
} else {
  try {
    devices = normalizeConfig(JSON.parse(fs.readFileSync(path.join(root, 'agent.config.json'), 'utf8'))).devices;
  } catch (e) {
    console.log(`Give the device IP:  npm run dump -- 192.168.1.201\n(${e.message})`);
    process.exit(1);
  }
}

const stamp = fmtTs(new Date()).replace(/[: ]/g, '-');
const csv = (v) => `"${String(v).replace(/"/g, '""')}"`;
let failed = false;

for (const dev of devices) {
  const out = outArg && devices.length === 1 ? outArg : path.join(process.cwd(), `punches-${dev.ip}-${stamp}.csv`);
  const zk = new ZKLib(dev.ip, dev.port, 10000, 4000);
  try {
    await zk.createSocket();
    const res = await zk.getAttendances();
    const rows = res.data ?? [];
    if (res.err) console.log(`[WARN] ${dev.name}: transfer broke off midway (${errorText(res.err)}), the file has what was received`);
    const lines = ['deviceUserId,recordTime,userSn'];
    for (const r of rows) {
      const t = r.recordTime ? new Date(r.recordTime) : null;
      lines.push([csv(r.deviceUserId ?? ''), csv(t && !Number.isNaN(t.getTime()) ? fmtTs(t) : ''), csv(r.userSn ?? '')].join(','));
    }
    fs.writeFileSync(out, `﻿${lines.join('\r\n')}\r\n`);
    console.log(`[OK]   ${dev.name} (${dev.ip}:${dev.port}): ${rows.length} records -> ${out}`);
  } catch (e) {
    failed = true;
    console.log(`[FAIL] ${dev.name} (${dev.ip}:${dev.port}): ${errorText(e)}`);
  } finally {
    await zk.disconnect().catch(() => {});
  }
}
process.exitCode = failed ? 1 : 0;
