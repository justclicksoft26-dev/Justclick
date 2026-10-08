import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import ZKLib from 'node-zklib';
import { validateEmployee, parsePunchCsv, validatePunches, isValidDate, localToday } from './validation.js';
import { getActualTimes, getDefaults, getLookups, postActualTimes, summarizeLateAbsent } from './posting.js';
import { importEmployees, templateBuffer } from './import-employees.js';
import { currentUser, login, requireAuth } from './auth.js';
import { Conflict, countPunches, createEmployee, deleteEmployee, loadEmployees, publicEmployee, storePunches } from './erp.js';

const app = express();
app.use(cors());

// On-site agent (Windows service next to the ZK device) pushes punches here. It authenticates with a
// shared key (AGENT_API_KEY in .env), not a user login, so this sits before requireAuth.
// It also gets a bigger JSON limit than the rest of the API.
const sameKey = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};
app.post('/api/agent/punches', express.json({ limit: '2mb' }), async (req, res, next) => {
  try {
    const key = process.env.AGENT_API_KEY;
    if (!key || !sameKey(req.get('x-agent-key') ?? '', key)) return res.status(401).json({ message: 'مفتاح غير صحيح' });
    const v = validatePunches(req.body?.punches);
    if (v.error) return res.status(400).json({ message: v.error });
    const r = await storePunches(v.rows);
    res.json({ received: r.received, stored: r.stored, ignored: r.received - r.stored });
  } catch (e) {
    next(e);
  }
});

app.use(express.json());
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

const nowInfo = () => {
  const d = new Date();
  return { date: localToday(), minutes: d.getHours() * 60 + d.getMinutes() };
};
const badRange = (f, t) => !isValidDate(f) || !isValidDate(t) || f > t;

// ---------- auth (ERP: ACC_USERS, password checked by AUTH_F) ----------
app.post('/api/auth/login', wrap(async (req, res) => {
  const username = String(req.body.username ?? '').trim();
  const password = String(req.body.password ?? '');
  if (!username || !password) return res.status(400).json({ message: 'اكتب اسم المستخدم وكلمة المرور' });
  const result = await login(username, password);
  if (!result) return res.status(401).json({ message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  res.json(result);
}));
app.get('/api/auth/me', requireAuth, currentUser);
app.use('/api', requireAuth);

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

app.get('/api/employees/template', wrap(async (_req, res) => {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(Buffer.from(await templateBuffer()));
}));

app.post('/api/employees/import', upload.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'اختار ملف Excel أولا' });
  const r = await importEmployees(req.file.buffer);
  if (r.error) return res.status(400).json({ message: r.error });
  res.json(r);
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

// ---------- posting actual times (APEX page 254) + reports fed from the posted rows ----------
const listOf = (v) => (v ? String(v).split(',').filter(Boolean) : []);
const filtersFrom = (src) => ({
  from: src.from, to: src.to, depts: listOf(src.depts), jobs: listOf(src.jobs), emps: listOf(src.emps),
});
const checkRange = ({ from, to }) => {
  if (!isValidDate(from) || !isValidDate(to) || from > to) return 'اختار فترة صحيحة';
  if (to > localToday()) return 'لا يمكن اختيار تاريخ في المستقبل';
  return null;
};

app.get('/api/posting/setup', wrap(async (_req, res) => {
  res.json({ defaults: await getDefaults(), ...(await getLookups()) });
}));

app.post('/api/posting/post', wrap(async (req, res) => {
  const f = { from: req.body.from, to: req.body.to, depts: req.body.depts, jobs: req.body.jobs, emps: req.body.emps };
  const bad = checkRange(f);
  if (bad) return res.status(400).json({ message: bad });
  res.json(await postActualTimes(f));
}));

app.get('/api/posting/actual', wrap(async (req, res) => {
  const f = filtersFrom(req.query);
  const bad = checkRange(f);
  if (bad) return res.status(400).json({ message: bad });
  res.json(await getActualTimes(f));
}));

app.get('/api/posting/late-absent', wrap(async (req, res) => {
  const f = filtersFrom(req.query);
  const bad = checkRange(f);
  if (bad) return res.status(400).json({ message: bad });
  const today = localToday();
  const active = new Set((await loadEmployees({ from: today, to: today, today })).filter((e) => e.status === 'ACTIVE').map((e) => e.code));
  res.json(summarizeLateAbsent(await getActualTimes(f), active));
}));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: 'حدث خطأ في الخادم' });
});

const port = Number(process.env.PORT) || 5000;
app.listen(port, () => console.log(`API on http://127.0.0.1:${port}`));
