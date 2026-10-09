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

const optId = (v) => (v === '' || v == null ? null : Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);

// Returns { values, errors } — errors is keyed by field, one message per field.
// autoCode: a blank code is accepted and assigned by the server (next sequential number).
export function validateEmployee(body, today = localToday(), { autoCode = false } = {}) {
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

  if (!(autoCode && code === '') && !/^\d{1,9}$/.test(code)) errors.code = 'كود الموظف لازم يكون أرقام (نفس كود جهاز البصمة)';
  if (!name || !/[؀-ۿ]/.test(name)) errors.name = 'يجب ادخال الاسم العربي';
  if (!/^\d{14}$/.test(nid)) errors.nationalId = 'رقم الهوية لازم يكون 14 رقم';
  const jobId = optId(body.jobId);
  const deptId = optId(body.deptId);
  if (!job && jobId == null) errors.job = 'الوظيفة مطلوبة';
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
    values: { code, name, nid, job, jobId, deptId, hireDate, status, start, end, weeklyOff: [...new Set(weeklyOff)].sort(), grace },
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

// Punches sent by the on-site agent: [{ code, ts }] with the same rules as the CSV import.
export function validatePunches(list, max = 5000) {
  if (!Array.isArray(list) || !list.length) return { error: 'لا توجد حركات' };
  if (list.length > max) return { error: `الحد الأقصى ${max} حركة في الطلب` };
  const rows = [];
  for (const [i, p] of list.entries()) {
    const code = String(p?.code ?? '').trim();
    const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(String(p?.ts ?? ''));
    if (!/^\d{1,9}$/.test(code) || !m || !isValidDate(m[1]) || +m[2] > 23 || +m[3] > 59 || +m[4] > 59) {
      return { error: `حركة غير صحيحة رقم ${i + 1}` };
    }
    rows.push({ code, ts: m[0] });
  }
  return { rows };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Full employee screen (view/edit): the registration rules plus the optional personal and lookup fields. */
export function validateEmployeeUpdate(body, lookupFields, today = localToday()) {
  const { errors, values } = validateEmployee({ ...body, code: '1' }, today);
  delete errors.code;
  const text = (k, max) => String(body[k] ?? '').trim().slice(0, max);
  const email = String(body.email ?? '').trim();
  const mobile1 = String(body.mobile1 ?? '').trim();
  const mobile2 = String(body.mobile2 ?? '').trim();
  const birth = String(body.birthDate ?? '').trim();
  const endDate = String(body.endDate ?? '').trim();

  if (email && (!EMAIL_RE.test(email) || email.length > 200)) errors.email = 'البريد الإلكتروني غير صحيح';
  if (mobile1 && !/^[0-9+\- ]{6,20}$/.test(mobile1)) errors.mobile1 = 'رقم الموبايل غير صحيح';
  if (mobile2 && !/^[0-9+\- ]{6,20}$/.test(mobile2)) errors.mobile2 = 'رقم الموبايل غير صحيح';
  if (birth && (!isValidDate(birth) || birth >= today)) errors.birthDate = 'تاريخ الميلاد غير صحيح';
  if (values.status === 'RESIGNED' && endDate && (!isValidDate(endDate) || endDate < values.hireDate)) errors.endDate = 'تاريخ ترك العمل غير صحيح';
  if (String(body.name ?? '').length > 200) errors.name = 'الاسم طويل جدا';

  const lookups = {};
  for (const f of lookupFields) lookups[f] = optId(body[f]);
  return {
    errors,
    values: {
      ...values,
      nameEn: text('nameEn', 200), email, mobile1, mobile2, birthDate: birth || null,
      endDate: values.status === 'RESIGNED' ? endDate || today : null,
      address: text('address', 1000), notes: text('notes', 1000), lookups,
    },
  };
}
