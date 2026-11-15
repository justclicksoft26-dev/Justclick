// Web check-in for staff: email (@horizon.sch.sa) -> OTP -> Check in / Check out.
// Mounted at /api/attendance BEFORE the ERP's requireAuth: these users sign in with the OTP, not the ERP login.
import crypto from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import { getDb } from '../mongo.js';
import { sendOtp } from './mailer.js';
import { localParts, now, windows } from './slots.js';

const DOMAIN = (process.env.CHECKIN_ALLOWED_DOMAIN || 'horizon.sch.sa').toLowerCase();
const SKIP_DOMAIN_CHECK = process.env.CHECKIN_SKIP_DOMAIN_CHECK === 'true'; // testing only
// separate secret so a check-in token can never be used as an ERP session
const SECRET = (process.env.CHECKIN_JWT_SECRET || process.env.SESSION_SECRET || 'dev-secret') + ':checkin';
const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_MS = 30 * 1000;
const MAX_ATTEMPTS = 5;
const SESSION_HOURS = Number(process.env.CHECKIN_SESSION_HOURS) || 5; // how long the OTP login stays valid

const emailRe = new RegExp(`^[a-z0-9._%+-]+@${DOMAIN.replace(/\./g, '\\.')}$`);
const isValidEmail = (e) => typeof e === 'string' && (SKIP_DOMAIN_CHECK ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) : emailRe.test(e));
const hash = (code) => crypto.createHmac('sha256', SECRET).update(code).digest('hex');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Session expired, please sign in again.' });
  }
}

// 1) request OTP
router.post('/request-otp', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!isValidEmail(email)) return res.status(400).json({ error: `Email must end with @${DOMAIN}` });
  const otps = (await getDb()).collection('otps');
  const row = await otps.findOne({ email });
  if (row && Date.now() - row.lastSentAt.getTime() < RESEND_MS) {
    const wait = Math.ceil((RESEND_MS - (Date.now() - row.lastSentAt.getTime())) / 1000);
    return res.status(429).json({ error: `Please wait ${wait}s before requesting another code.` });
  }
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await otps.updateOne(
    { email },
    { $set: { codeHash: hash(code), expiresAt: new Date(Date.now() + OTP_TTL_MS), attempts: 0, lastSentAt: new Date() } },
    { upsert: true },
  );
  try {
    await sendOtp(email, code);
  } catch (err) {
    console.error('[checkin] mail error:', err.message);
    return res.status(500).json({ error: 'Could not send the email. Try again later.' });
  }
  res.json({ ok: true });
}));

// 2) verify OTP
router.post('/verify-otp', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const code = String(req.body.code || '').trim();
  if (!isValidEmail(email) || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Invalid email or code format.' });
  const otps = (await getDb()).collection('otps');
  const row = await otps.findOne({ email });
  if (!row || row.expiresAt.getTime() < Date.now()) return res.status(400).json({ error: 'Code expired. Request a new one.' });
  if (row.attempts >= MAX_ATTEMPTS) return res.status(429).json({ error: 'Too many attempts. Request a new code.' });
  const ok = crypto.timingSafeEqual(Buffer.from(hash(code)), Buffer.from(row.codeHash));
  if (!ok) {
    await otps.updateOne({ email }, { $inc: { attempts: 1 } });
    return res.status(400).json({ error: 'Incorrect code.' });
  }
  await otps.deleteOne({ email });
  res.json({ token: jwt.sign({ email }, SECRET, { expiresIn: `${SESSION_HOURS}h` }), email });
}));

// What the employee can do right now (the server clock decides, never the client)
async function buildState(email) {
  const { date, time, minutes } = localParts();
  const logs = await (await getDb()).collection('attendance_logs').find({ email, date }).toArray();
  const inLog = logs.find((l) => l.type === 'check_in');
  const outLog = logs.find((l) => l.type === 'check_out');
  const w = windows(minutes);

  let inNote = '';
  if (inLog) inNote = 'Check-in recorded for today.';
  else if (!w.checkIn) {
    inNote =
      minutes < 7 * 60 + 30 ? 'Check-in opens at 7:30 AM.'
      : minutes >= 14 * 60 ? 'Attendance is closed for today (7:30 AM - 2:00 PM).'
      : 'Check-in is closed after 1:00 PM.';
  }

  let outNote = '';
  if (outLog) outNote = 'Check-out recorded for today.';
  else if (minutes >= 14 * 60) outNote = 'Check-out is closed for today.';
  else if (!inLog) outNote = 'Check in first.';
  else if (!w.checkOut) outNote = 'Check-out opens at 1:45 PM.';

  return {
    email,
    date,
    time,
    checkIn: { enabled: w.checkIn && !inLog, done: !!inLog, at: inLog ? localParts(inLog.recordedAt).time : null, note: inNote },
    checkOut: { enabled: w.checkOut && !!inLog && !outLog, done: !!outLog, at: outLog ? localParts(outLog.recordedAt).time : null, note: outNote },
  };
}

// 3) today's state
router.get('/status', auth, wrap(async (req, res) => res.json(await buildState(req.user.email))));

// 4) record check-in / check-out
router.post('/', auth, wrap(async (req, res) => {
  const { type } = req.body;
  if (!['check_in', 'check_out'].includes(type)) return res.status(400).json({ error: 'Invalid action.' });
  const state = await buildState(req.user.email);
  const s = type === 'check_in' ? state.checkIn : state.checkOut;
  if (!s.enabled) return res.status(s.done ? 409 : 400).json({ error: s.note || 'Not available right now.' });
  const db = await getDb();
  try {
    await db.collection('attendance_logs').insertOne({
      email: req.user.email,
      date: state.date,
      type,
      recordedAt: now(),
      ip: req.ip,
      userAgent: req.headers['user-agent'] || '',
    });
    // the first check-in registers him as an employee (no-op afterwards); the report finds absences with this list
    const local = req.user.email.split('@')[0];
    await db.collection('employees').updateOne(
      { email: req.user.email },
      { $setOnInsert: { name: local.replace(/[._-]+/g, ' '), registeredAt: now(), firstDate: state.date, active: true } },
      { upsert: true },
    );
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Already recorded for today.' });
    throw err;
  }
  res.json(await buildState(req.user.email));
}));

// own error handler: these pages show { error }, the ERP handler answers { message }
router.use((err, _req, res, _next) => {
  console.error('[checkin]', err);
  res.status(500).json({ error: 'Server error.' });
});

export default router;
