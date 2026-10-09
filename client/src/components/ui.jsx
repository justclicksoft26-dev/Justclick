import { useEffect, useMemo, useState } from 'react';
import { WEEK_DAYS, norm } from '../api.js';

// ---------- icons (24x24 stroke icons) ----------
const PATHS = {
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2',
  fingerprint: 'M12 11v3a8 8 0 0 1-1 4M8 12a4 4 0 0 1 8 0v1M5 12a7 7 0 0 1 14 0v2M12 7a5 5 0 0 0-5 5c0 1.5-.2 3-.7 4.4',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2',
  chart: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3',
  trash: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z',
  x: 'M18 6 6 18M6 6l12 12',
  check: 'M20 6 9 17l-5-5',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 16v-4M12 8h.01',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  menu: 'M3 6h18M3 12h18M3 18h18',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  play: 'M5 3l14 9-14 9Z',
  wifi: 'M5 12.55a11 11 0 0 1 14 0M1.4 9a16 16 0 0 1 21.2 0M8.5 16.1a6 6 0 0 1 7 0M12 20h.01',
};

export function Icon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

// ---------- layout pieces ----------
export function PageHeader({ title, subtitle, children }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="page-head-actions">{children}</div>}
    </header>
  );
}

export function Stat({ label, value, tone = 'primary', icon }) {
  return (
    <div className={`stat ${tone}`}>
      {icon && <span className="stat-icon"><Icon name={icon} size={20} /></span>}
      <div>
        <div className="stat-value">{value ?? '—'}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}

export function Badge({ tone = 'neutral', children }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Field({ label, error, hint, children, className = '' }) {
  return (
    <label className={`field ${className}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && !error && <small className="hint">{hint}</small>}
      {error && <small className="err">{error}</small>}
    </label>
  );
}

export function Empty({ icon = 'info', title, children }) {
  return (
    <div className="empty">
      <span><Icon name={icon} size={26} /></span>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Alert({ tone = 'info', children }) {
  return (
    <div className={`alert ${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon name={tone === 'danger' ? 'alert' : tone === 'success' ? 'check' : 'info'} size={18} />
      <div>{children}</div>
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" />;
}

// ---------- modal + confirm ----------
export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="إغلاق"><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function useConfirm() {
  const [st, setSt] = useState(null);
  const confirm = (opts) => new Promise((resolve) => setSt({ ...opts, resolve }));
  const done = (v) => {
    st.resolve(v);
    setSt(null);
  };
  const node = st && (
    <Modal
      title={st.title ?? 'تأكيد'}
      onClose={() => done(false)}
      footer={(
        <>
          <button type="button" className="btn ghost" onClick={() => done(false)}>إلغاء</button>
          <button type="button" className={`btn ${st.danger ? 'danger' : ''}`} onClick={() => done(true)}>{st.confirmText ?? 'تأكيد'}</button>
        </>
      )}
    >
      <p className="confirm-text">{st.message}</p>
    </Modal>
  );
  return [confirm, node];
}

// ---------- toasts ----------
export const notify = (text, tone = 'success') => window.dispatchEvent(new CustomEvent('toast', { detail: { text, tone, id: Math.random() } }));

export function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const on = (e) => {
      const t = e.detail;
      setItems((x) => [...x, t]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== t.id)), 4500);
    };
    window.addEventListener('toast', on);
    return () => window.removeEventListener('toast', on);
  }, []);
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}><Icon name={t.tone === 'danger' ? 'alert' : 'check'} size={18} />{t.text}</div>
      ))}
    </div>
  );
}

// ---------- pickers ----------
export function WeekdayPicker({ value, onChange }) {
  const toggle = (d) => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d]);
  return (
    <div className="chips" role="group" aria-label="أيام الإجازة الأسبوعية">
      {WEEK_DAYS.map((d) => (
        <button key={d.value} type="button" className={`chip${value.includes(d.value) ? ' on' : ''}`} aria-pressed={value.includes(d.value)} onClick={() => toggle(d.value)}>
          {d.label}
        </button>
      ))}
    </div>
  );
}

/** Searchable checkbox list. options: [{ id, name }], value: array of ids (strings). */
export function OptionPicker({ options, value, onChange, placeholder = 'بحث بالاسم', emptyHint = 'بدون تحديد = الكل', height = 200 }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const n = norm(q.trim());
    return n ? options.filter((o) => norm(String(o.name)).includes(n)) : options;
  }, [options, q]);
  const ids = shown.map((o) => String(o.id));
  const allShown = ids.length > 0 && ids.every((i) => value.includes(i));
  const toggle = (id) => onChange(value.includes(id) ? value.filter((c) => c !== id) : [...value, id]);
  const toggleShown = () => onChange(allShown ? value.filter((c) => !ids.includes(c)) : [...new Set([...value, ...ids])]);
  return (
    <div className="picker">
      <div className="picker-bar">
        <div className="search">
          <Icon name="search" size={16} />
          <input placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button type="button" className="btn ghost sm" onClick={toggleShown} disabled={!ids.length}>{allShown ? 'إلغاء الظاهر' : 'تحديد الظاهر'}</button>
        {value.length > 0 && <button type="button" className="btn ghost sm" onClick={() => onChange([])}>مسح</button>}
        <span className="picker-count">{value.length ? `${value.length} محدد` : emptyHint}</span>
      </div>
      <div className="picker-list" style={{ maxHeight: height }}>
        {shown.map((o) => {
          const id = String(o.id);
          return (
            <label key={id} className={`picker-item${value.includes(id) ? ' on' : ''}`}>
              <input type="checkbox" checked={value.includes(id)} onChange={() => toggle(id)} />
              <span>{o.name}</span>
            </label>
          );
        })}
        {!shown.length && <span className="picker-empty">لا نتائج</span>}
      </div>
    </div>
  );
}
