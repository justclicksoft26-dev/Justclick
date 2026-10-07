const BASE = import.meta.env.VITE_API_URL ?? '';

const TOKEN_KEY = 'auth_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export async function api(path, { method = 'GET', body, form } = {}) {
  const init = { method, headers: {} };
  const token = getToken();
  if (token) init.headers.Authorization = `Bearer ${token}`;
  if (form) init.body = form;
  else if (body) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`${BASE}${path}`, init);
  } catch {
    throw { message: 'تعذر الاتصال بالخادم' };
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) {
    setToken(null);
    window.dispatchEvent(new Event('auth-expired'));
  }
  if (!res.ok) throw { message: data.message, errors: data.errors };
  return data;
}

export const today = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// Monday-first, values are JS getDay() numbers (0 = Sunday)
export const WEEK_DAYS = [
  { value: 1, label: 'الاثنين' }, { value: 2, label: 'الثلاثاء' }, { value: 3, label: 'الأربعاء' },
  { value: 4, label: 'الخميس' }, { value: 5, label: 'الجمعة' }, { value: 6, label: 'السبت' },
  { value: 0, label: 'الأحد' },
];
export const dayLabel = (v) => WEEK_DAYS.find((d) => d.value === v)?.label;

// «في إجازة» تُحسب تلقائيا من جدول الإجازات في النظام، فلا تُختار عند التسجيل
export const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'نشط' }, { value: 'SUSPENDED', label: 'موقوف' }, { value: 'RESIGNED', label: 'مستقيل' },
];
