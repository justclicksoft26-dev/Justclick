import ExcelJS from 'exceljs';
import { Conflict, createEmployee } from './erp.js';
import { validateEmployee } from './validation.js';

// Excel columns (Arabic or English header). Required: code, name, nationalId, job, hireDate, shiftStart, shiftEnd, weeklyOff.
const COLUMNS = [
  { key: 'code', label: 'الكود', aliases: ['code', 'id', 'كود', 'كود الموظف', 'رقم الموظف'] },
  { key: 'name', label: 'الاسم', aliases: ['name', 'اسم', 'اسم الموظف'] },
  { key: 'nationalId', label: 'رقم الهوية', aliases: ['nationalid', 'national id', 'هوية', 'الهوية', 'رقم قومي', 'الرقم القومي'] },
  { key: 'job', label: 'الوظيفة', aliases: ['job', 'وظيفة', 'المسمى الوظيفي'] },
  { key: 'hireDate', label: 'تاريخ التعيين', aliases: ['hiredate', 'hire date', 'تعيين', 'التعيين'] },
  { key: 'status', label: 'الحالة', aliases: ['status', 'حالة'] },
  { key: 'shiftStart', label: 'بداية الدوام', aliases: ['shiftstart', 'start', 'من', 'بداية', 'حضور'] },
  { key: 'shiftEnd', label: 'نهاية الدوام', aliases: ['shiftend', 'end', 'الى', 'إلى', 'نهاية', 'انصراف'] },
  { key: 'weeklyOff', label: 'الإجازة الأسبوعية', aliases: ['weeklyoff', 'weekly off', 'اجازة', 'إجازة', 'الاجازة', 'الإجازة', 'الاجازة الاسبوعية'] },
  { key: 'graceMin', label: 'السماحية', aliases: ['grace', 'gracemin', 'سماحية', 'السماحيه'] },
];
const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ');
const HEADER_KEY = new Map(COLUMNS.flatMap((c) => [c.label, c.key, ...c.aliases].map((a) => [norm(a), c.key])));

const STATUS_MAP = new Map([
  ['نشط', 'ACTIVE'], ['active', 'ACTIVE'], ['موقوف', 'SUSPENDED'], ['suspended', 'SUSPENDED'],
  ['مستقيل', 'RESIGNED'], ['resigned', 'RESIGNED'],
]);
// JS getDay() numbers (0 = Sunday), same as the employee form
const DAY_MAP = new Map([
  ['الاحد', 0], ['sunday', 0], ['sun', 0], ['الاثنين', 1], ['الاتنين', 1], ['monday', 1], ['mon', 1],
  ['الثلاثاء', 2], ['التلات', 2], ['tuesday', 2], ['tue', 2], ['الاربعاء', 3], ['wednesday', 3], ['wed', 3],
  ['الخميس', 4], ['thursday', 4], ['thu', 4], ['الجمعه', 5], ['friday', 5], ['fri', 5], ['السبت', 6], ['saturday', 6], ['sat', 6],
]);

const p2 = (n) => String(n).padStart(2, '0');
const raw = (v) => (v && typeof v === 'object' && 'result' in v ? v.result : v && typeof v === 'object' && 'text' in v ? v.text : v);

function toDate(v) {
  v = raw(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v ?? '').trim();
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${p2(m[2])}-${p2(m[3])}`;
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(s);
  return m ? `${m[3]}-${p2(m[2])}-${p2(m[1])}` : s;
}

function toTime(v) {
  v = raw(v);
  if (v instanceof Date) return `${p2(v.getUTCHours())}:${p2(v.getUTCMinutes())}`;
  if (typeof v === 'number' && v >= 0 && v < 1) {
    const mins = Math.round(v * 1440);
    return `${p2(Math.floor(mins / 60) % 24)}:${p2(mins % 60)}`;
  }
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v ?? '').trim());
  return m ? `${p2(m[1])}:${m[2]}` : String(v ?? '').trim();
}

function toDays(v) {
  const parts = String(raw(v) ?? '').split(/[,،;/\-+\n]|\sو\s/).map((x) => x.trim().replace(/^ال(?=\S{3,})/, 'ال')).filter(Boolean);
  return parts.map((x) => DAY_MAP.get(norm(x)) ?? NaN);
}

export const text = (v) => String(raw(v) ?? '').trim();

export async function templateBuffer() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('الموظفين', { views: [{ rightToLeft: true }] });
  ws.columns = COLUMNS.map((c) => ({ header: c.label, key: c.key, width: 20 }));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00294F' } };
  ws.addRow({
    code: '101', name: 'محمد أحمد', nationalId: '29801010101010', job: 'محاسب', hireDate: '2025-01-01', status: 'نشط',
    shiftStart: '09:00', shiftEnd: '17:00', weeklyOff: 'الجمعة، السبت', graceMin: 15,
  });
  return wb.xlsx.writeBuffer();
}

/** Reads the sheet into employee objects; returns { error } for unusable files. */
export async function readEmployeesSheet(buffer) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    return { error: 'الملف ليس ملف Excel (xlsx) صحيح' };
  }
  const ws = wb.worksheets[0];
  if (!ws) return { error: 'الملف فارغ' };

  const cols = {};
  ws.getRow(1).eachCell((cell, n) => {
    const key = HEADER_KEY.get(norm(raw(cell.value)));
    if (key && !(key in cols)) cols[key] = n;
  });
  const missing = COLUMNS.filter((c) => !['status', 'graceMin'].includes(c.key) && !(c.key in cols)).map((c) => c.label);
  if (missing.length) return { error: `أعمدة ناقصة في الملف: ${missing.join('، ')}` };

  const rows = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const get = (k) => (k in cols ? row.getCell(cols[k]).value : null);
    if (COLUMNS.every((c) => text(get(c.key)) === '')) return;
    const statusRaw = text(get('status'));
    const graceRaw = text(get('graceMin'));
    rows.push({
      line: rowNumber,
      body: {
        code: text(get('code')), name: text(get('name')), nationalId: text(get('nationalId')), job: text(get('job')),
        hireDate: toDate(get('hireDate')),
        status: statusRaw ? (STATUS_MAP.get(norm(statusRaw)) ?? statusRaw) : 'ACTIVE',
        shiftStart: toTime(get('shiftStart')), shiftEnd: toTime(get('shiftEnd')),
        weeklyOff: toDays(get('weeklyOff')),
        graceMin: graceRaw === '' ? 15 : graceRaw,
      },
    });
  });
  if (!rows.length) return { error: 'الملف لا يحتوي على موظفين' };
  return { rows };
}

/** Imports row by row (each employee in its own transaction) so one bad row never blocks the others. */
export async function importEmployees(buffer) {
  const parsed = await readEmployeesSheet(buffer);
  if (parsed.error) return parsed;
  const failed = [];
  let created = 0;
  const seen = new Set();
  for (const { line, body } of parsed.rows) {
    const { errors, values } = validateEmployee(body);
    if (!Object.keys(errors).length && (seen.has(values.code) || seen.has(`n${values.nid}`))) {
      errors.code = 'مكرر داخل الملف';
    }
    if (Object.keys(errors).length) {
      failed.push({ line, code: body.code, name: body.name, reasons: Object.values(errors) });
      continue;
    }
    try {
      await createEmployee(values);
      created++;
      seen.add(values.code);
      seen.add(`n${values.nid}`);
    } catch (e) {
      if (!(e instanceof Conflict)) throw e;
      failed.push({ line, code: body.code, name: body.name, reasons: Object.values(e.errors) });
    }
  }
  return { total: parsed.rows.length, created, failed };
}
