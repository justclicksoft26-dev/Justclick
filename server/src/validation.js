export const STATUSES = { ACTIVE: 'نشط', ON_LEAVE: 'في إجازة', SUSPENDED: 'موقوف', RESIGNED: 'مستقيل' };

// ON_LEAVE is derived from EMP_VACATION, so it cannot be chosen when registering.
export const SAVEABLE_STATUSES = ['ACTIVE', 'SUSPENDED', 'RESIGNED'];

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(s) {
  if (!DATE_RE.test(s ?? '')) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function localToday() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Returns { values, errors } — errors is keyed by field, one message per field.
export function validateEmployee(body, today = localToday()) {
  const errors = {};
  const code = String(body.code ?? '').trim();
  const name = String(body.name ?? '').trim();
  const nid = String(body.nationalId ?? '').trim();
  const job = String(body.job ?? '').trim();
  const hireDate = String(body.hireDate ?? '').trim();
  const status = String(body.status ?? '');
  const start = String(body.shiftStart ?? '');
  const end = String(body.shiftEnd ?? '');
  const weeklyOff = Array.isArray(body.weeklyOff) ? body.weeklyOff.map(Number) : [];
  const graceRaw = body.graceMin;

  if (!/^\d{1,9}$/.test(code)) errors.code = 'كود الموظف لازم يكون أرقام (نفس كود جهاز البصمة)';
  if (!name || !/[؀-ۿ]/.test(name)) errors.name = 'يجب ادخال الاسم العربي';
  if (!/^\d{14}$/.test(nid)) errors.nationalId = 'رقم الهوية لازم يكون 14 رقم';
  if (!job) errors.job = 'الوظيفة مطلوبة';
  if (!isValidDate(hireDate) || hireDate > today) errors.hireDate = 'تاريخ التعيين لا يكون في المستقبل';
  if (!SAVEABLE_STATUSES.includes(status)) errors.status = 'الحالة غير صحيحة';
  if (!TIME_RE.test(start) || !TIME_RE.test(end) || toMinutes(end) <= toMinutes(start)) {
    errors.shift = 'نهاية الدوام لازم تكون بعد البداية';
  }
  if (!weeklyOff.length || weeklyOff.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    errors.weeklyOff = 'اختار يوم إجازة واحد على الأقل';
  }
  const grace = graceRaw === '' || graceRaw == null ? NaN : Number(graceRaw);
  if (!Number.isInteger(grace) || grace < 0 || grace > 60) errors.graceMin = 'السماحية من 0 إلى 60 دقيقة';

  return {
    errors,
    values: { code, name, nid, job, hireDate, status, start, end, weeklyOff: [...new Set(weeklyOff)].sort(), grace },
  };
}

// CSV with header `code,timestamp` and timestamps `YYYY-MM-DD HH:mm:ss`.
// The whole file is rejected on any malformed header/row.
export function parsePunchCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) return { error: 'الملف فارغ' };
  const header = lines[0].split(',').map((c) => c.trim().toLowerCase());
  if (header.length !== 2 || header[0] !== 'code' || header[1] !== 'timestamp') {
    return { error: 'الأعمدة لازم تكون: code,timestamp' };
  }
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    const code = parts[0]?.trim();
    const ts = (parts[1] ?? '').trim().replace(/^"|"$/g, '');
    const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(ts);
    if (!/^\d{1,9}$/.test(code ?? '') || parts.length !== 2 || !m || !isValidDate(m[1]) || +m[2] > 23 || +m[3] > 59 || +m[4] > 59) {
      return { error: `صيغة غير صحيحة في السطر ${i + 1} (المطلوب: YYYY-MM-DD HH:mm:ss)` };
    }
    rows.push({ code, ts: `${m[1]} ${m[2]}:${m[3]}:${m[4]}` });
  }
  if (!rows.length) return { error: 'الملف لا يحتوي على حركات' };
  return { rows };
}
