import express from 'express';
import cors from 'cors';
import multer from 'multer';
import ZKLib from 'node-zklib';
import { validateEmployee, parsePunchCsv, isValidDate, localToday } from './validation.js';
import { analyzeEmployee } from './attendance.js';
import { Conflict, countPunches, createEmployee, deleteEmployee, loadEmployees, loadPunches, publicEmployee, storePunches } from './erp.js';

const app = express();
app.use(cors());
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

const nowInfo = () => {
  const d = new Date();
  return { date: localToday(), minutes: d.getHours() * 60 + d.getMinutes() };
};
const badRange = (f, t) => !isValidDate(f) || !isValidDate(t) || f > t;

// ---------- employees (ERP: EMPLOYEES, SHIFT_EMP/SHIFT_SETUP, OFFCIAL_HOLIDAY_*) ----------
app.get('/api/employees', wrap(async (_req, res) => {
  const today = localToday();
  res.json((await loadEmployees({ from: today, to: today, today })).map(publicEmployee));
}));

app.post('/api/employees', wrap(async (req, res) => {
  const { errors, values } = validateEmployee(req.body);
  if (Object.keys(errors).length) return res.status(400).json({ errors });
  try {
    await createEmployee(values);
  } catch (e) {
    if (e instanceof Conflict) return res.status(409).json({ errors: e.errors });
    throw e;
  }
  res.status(201).json({ ok: true });
}));

app.delete('/api/employees/:code', wrap(async (req, res) => {
  if (!/^\d+$/.test(req.params.code)) return res.status(404).json({ message: 'الموظف غير موجود' });
  const r = await deleteEmployee(req.params.code);
  if (!r.found) return res.status(404).json({ message: 'الموظف غير موجود' });
  if (r.blocked.length) {
    return res.status(409).json({ message: `لا يمكن حذف الموظف لوجود بيانات مرتبطة به في النظام (${r.blocked.join('، ')})` });
  }
  res.json({ ok: true });
}));

// ---------- punches (ERP: ATT_EMP) ----------
const pad = (n) => String(n).padStart(2, '0');
const fmtTs = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const summary = (r) => ({ received: r.received, stored: r.stored, ignored: r.received - r.stored });

app.post('/api/punches/pull', wrap(async (req, res) => {
  const ip = String(req.body.ip ?? '').trim();
  const port = Number(req.body.port);
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip) || !Number.isInteger(port) || port < 1 || port > 65535) {
    return res.status(400).json({ message: 'عنوان الجهاز أو المنفذ غير صحيح' });
  }
  const zk = new ZKLib(ip, port, 10000, 4000);
  let logs;
  try {
    await zk.createSocket();
    logs = (await zk.getAttendances()).data ?? [];
  } catch {
    return res.status(502).json({ message: 'تعذر الاتصال بالجهاز، تأكد من العنوان والمنفذ أو ارفع ملف CSV' });
  } finally {
    await zk.disconnect().catch(() => {});
  }
  const rows = logs
    .filter((l) => /^\d{1,9}$/.test(String(l.deviceUserId ?? '').trim()) && l.recordTime)
    .map((l) => ({ code: String(l.deviceUserId).trim(), ts: fmtTs(new Date(l.recordTime)) }));
  res.json(summary(await storePunches(rows)));
}));

app.post('/api/punches/upload', upload.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'اختار ملف CSV أولا' });
  const parsed = parsePunchCsv(req.file.buffer.toString('utf8'));
  if (parsed.error) return res.status(400).json({ message: `تم رفض الملف: ${parsed.error}` });
  res.json(summary(await storePunches(parsed.rows)));
}));

app.get('/api/punches/count', wrap(async (_req, res) => {
  res.json({ total: await countPunches() });
}));

// ---------- reports ----------
app.get('/api/reports/employee', wrap(async (req, res) => {
  const { code, from, to } = req.query;
  if (!/^\d+$/.test(code ?? '') || badRange(from, to)) return res.status(400).json({ message: 'اختار الموظف وفترة صحيحة' });
  const today = localToday();
  const [emp] = await loadEmployees({ empId: Number(code), from, to, today });
  if (!emp) return res.status(404).json({ message: 'الموظف غير موجود' });
  const punches = (await loadPunches({ empId: emp._id, from, to })).get(emp._id) ?? new Map();
  res.json({ employee: publicEmployee(emp), ...analyzeEmployee(emp, punches, from, to, nowInfo()) });
}));

app.get('/api/reports/late-absent', wrap(async (req, res) => {
  const { from, to } = req.query;
  if (badRange(from, to)) return res.status(400).json({ message: 'اختار فترة صحيحة' });
  const today = localToday();
  const emps = (await loadEmployees({ from, to, today })).filter((e) => e.status === 'ACTIVE');
  const punches = await loadPunches({ from, to });
  const now = nowInfo();
  res.json(emps.map((e) => ({
    code: e.code,
    name: e.name,
    ...analyzeEmployee(e, punches.get(e._id) ?? new Map(), from, to, now).summary,
  })));
}));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: 'حدث خطأ في الخادم' });
});

const port = Number(process.env.PORT) || 5000;
app.listen(port, () => console.log(`API on http://127.0.0.1:${port}`));
