// Installs / removes the agent as a Windows service (run from an Administrator terminal).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nw from 'node-windows';

const { Service } = nw;
const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'agent.js');

const svc = new Service({
  name: 'AttendanceAgent',
  description: 'Pulls punches from the ZK device and pushes them to the attendance server',
  script,
  wait: 2, // seconds before restarting after a crash
  grow: 0.5,
  maxRestarts: 0, // keep restarting
});

const action = process.argv[2];

svc.on('install', () => {
  console.log('installed, starting...');
  svc.start();
});
svc.on('alreadyinstalled', () => console.log('already installed'));
svc.on('uninstall', () => console.log('uninstalled'));
svc.on('error', (e) => console.error(e));

if (action === 'install') svc.install();
else if (action === 'uninstall') svc.uninstall();
else console.log('usage: node src/service.js install | uninstall');
