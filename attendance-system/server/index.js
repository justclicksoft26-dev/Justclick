import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { connectDb, Otp, Attendance } from './db.js';
import { SLOTS, currentSlot, localParts, now } from './slots.js';
import { sendOtp } from './mailer.js';

const PORT = Number(process.env.PORT || 4000);
const DOMAIN = (process.env.ALLOWED_DOMAIN || 'horizon.sch.sa').toLowerCase();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_MS = 30 * 1000;
const MAX_ATTEMPTS = 5;

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

const hash = (code) => crypto.createHmac('sha256', JWT_SECRET).update(code).digest('hex');
const emailRe = new RegExp(`^[a-z0-9._%+-]+@${DOMAIN.replace(/\./g, '\\.')}$`);
// Set SKIP_DOMAIN_CHECK=true in .env to temporarily accept any email address (testing only)
const SKIP_DOMAIN_CHECK = process.env.SKIP_DOMAIN_CHECK === 'true';
const isValidEmail = (e) =>
  typeof e === 'string' &&
  (SKIP_DOMAIN_CHECK ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) : emailRe.test(e));

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Session expired, please sign in again.' });
  }
}

// 1) request OTP
app.post('/api/auth/request-otp', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: `Email must end with @${DOMAIN}` });
  }
  const row = await Otp.findOne({ email });
  if (row && Date.now() - row.lastSentAt.getTime() < RESEND_MS) {
    const wait = Math.ceil((RESEND_MS - (Date.now() - row.lastSentAt.getTime())) / 1000);
    return res.status(429).json({ error: `Please wait ${wait}s before requesting another code.` });
  }
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await Otp.findOneAndUpdate(
    { email },
    { codeHash: hash(code), expiresAt: new Date(Date.now() + OTP_TTL_MS), attempts: 0, lastSentAt: new Date() },
    { upsert: true }
  );
  try {
    await sendOtp(email, code);
  } catch (err) {
    console.error('Mail error:', err.message);
    return res.status(500).json({ error: 'Could not send the email. Try again later.' });
  }
  const body = { ok: true };
  if (process.env.DEV_RETURN_OTP === 'true') body.devOtp = code;
  res.json(body);
});

// 2) verify OTP
app.post('/api/auth/verify-otp', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const code = String(req.body.code || '').trim();
  if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Invalid email or code format.' });
  }
  const row = await Otp.findOne({ email });
  if (!row || row.expiresAt.getTime() < Date.now()) {
    return res.status(400).json({ error: 'Code expired. Request a new one.' });
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'Too many attempts. Request a new code.' });
  }
  const ok = crypto.timingSafeEqual(Buffer.from(hash(code)), Buffer.from(row.codeHash));
  if (!ok) {
    await Otp.updateOne({ email }, { $inc: { attempts: 1 } });
    return res.status(400).json({ error: 'Incorrect code.' });
  }
  await Otp.deleteOne({ email });
  const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, email });
});

// 3) slot info + today's records
app.get('/api/attendance/status', auth, async (req, res) => {
  const { date, hour, minute } = localParts();
  const cur = currentSlot();
  const records = (await Attendance.find({ email: req.user.email, date }).lean()).map((r) => ({
    slot: r.slot,
    status: r.status,
    recorded_at: r.recordedAt,
  }));
  res.json({
    email: req.user.email,
    date,
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    currentSlot: cur ? cur.id : null,
    slots: SLOTS.map((s) => ({ id: s.id, label: s.label })),
    records,
  });
});

// 4) record attendance
app.post('/api/attendance', auth, async (req, res) => {
  const { status } = req.body;
  if (!['present', 'absent'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  const cur = currentSlot(); // slot is decided by the server clock, not the client
  if (!cur) return res.status(400).json({ error: 'Attendance is closed at this time.' });
  const { date } = localParts();
  try {
    await Attendance.create({
      email: req.user.email,
      date,
      slot: cur.id,
      status,
      recordedAt: now(),
      ip: req.ip,
      userAgent: req.headers['user-agent'] || '',
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Attendance already recorded for this period.' });
    }
    throw err;
  }
  res.json({ ok: true, slot: cur.id, status, date });
});

// Production: serve the built React app (client/dist) from the same server/port
const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../client/dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error.' });
});

connectDb()
  .then(() => app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`)))
  .catch((err) => {
    console.error('Cannot connect to MongoDB:', err.message);
    process.exit(1);
  });
