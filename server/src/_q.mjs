import fs from 'node:fs';
import { query } from './db.js';
const r = await query(fs.readFileSync(process.argv[2], 'utf8').trim().replace(/;$/, ''), {}, { maxRows: 500 });
console.log(JSON.stringify(r.rows, null, 0));
process.exit(0);
