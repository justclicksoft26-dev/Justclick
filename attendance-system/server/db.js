import dns from 'node:dns';
import mongoose from 'mongoose';

// Some local DNS resolvers refuse SRV lookups (needed by mongodb+srv://); use public DNS for them.
dns.setServers(['8.8.8.8', '1.1.1.1']);

export async function connectDb() {
  // The URI may contain <db_username>/<db_password> placeholders, filled from DB_USER / DB_PASS
  const uri = (process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/attendance')
    .replace('<db_username>', encodeURIComponent(process.env.DB_USER || ''))
    .replace('<db_password>', encodeURIComponent(process.env.DB_PASS || ''));
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  await Attendance.syncIndexes();
  console.log('MongoDB connected');
}

const otpSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  codeHash: { type: String, required: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 600 } }, // auto-clean
  attempts: { type: Number, default: 0 },
  lastSentAt: { type: Date, required: true },
});

const attendanceSchema = new mongoose.Schema({
  email: { type: String, required: true },
  date: { type: String, required: true }, // YYYY-MM-DD (local time)
  type: { type: String, required: true, enum: ['check_in', 'check_out'] },
  recordedAt: { type: Date, required: true },
  ip: String,
  userAgent: String,
});
// one check-in and one check-out per employee per day
attendanceSchema.index({ email: 1, date: 1, type: 1 }, { unique: true });

// An employee is registered automatically the first time he checks in. The report uses this list to
// find who missed a day (no check-in and no check-out = absent).
const employeeSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: { type: String, default: '' },
  registeredAt: { type: Date, required: true },
  firstDate: { type: String, required: true }, // YYYY-MM-DD of the first check-in; absence counts from here on
  active: { type: Boolean, default: true },
});

export const Otp = mongoose.model('Otp', otpSchema);
export const Employee = mongoose.model('Employee', employeeSchema, 'employees');
export const Attendance = mongoose.model('Attendance', attendanceSchema, 'attendance_logs');
