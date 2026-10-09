import { useEffect, useMemo, useState } from 'react';
import Loading from '../Loading.jsx';
import { api, today, norm } from '../api.js';
import { Alert, Badge, Empty, Field, Icon, Modal, OptionPicker, PageHeader, Spinner, Stat, notify, useConfirm } from '../components/ui.jsx';

// Quick-fill names; fixed-date national holidays also fill the date for the chosen year.
const PRESETS = [
  { name: 'رأس السنة الميلادية', md: '01-01' },
  { name: 'عيد الميلاد المجيد', md: '01-07' },
  { name: 'ثورة 25 يناير / عيد الشرطة', md: '01-25' },
  { name: 'عيد تحرير سيناء', md: '04-25' },
  { name: 'عيد العمال', md: '05-01' },
  { name: 'ثورة 30 يونيو', md: '06-30' },
  { name: 'ثورة 23 يوليو', md: '07-23' },
  { name: 'عيد القوات المسلحة', md: '10-06' },
  { name: 'عيد الفطر المبارك' },
  { name: 'عيد الأضحى المبارك' },
  { name: 'رأس السنة الهجرية' },
  { name: 'المولد النبوي الشريف' },
  { name: 'شم النسيم' },
];

const dayCount = (f, t) => Math.round((new Date(`${t}T00:00:00Z`) - new Date(`${f}T00:00:00Z`)) / 86400000) + 1;

function phase(h, now) {
  if (h.to < now) return { label: 'منتهية', tone: 'neutral' };
  if (h.from > now) return { label: 'قادمة', tone: 'info' };
  return { label: 'جارية الآن', tone: 'success' };
}

function HolidayForm({ id, employees, activeCount, onClose, onSaved }) {
  const [form, setForm] = useState({ nameAr: '', nameEn: '', from: today(), to: today(), scope: 'all', emps: [] });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(id != null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (id == null) return;
    api(`/api/holidays/${id}`)
      .then((h) => setForm({
        nameAr: h.nameAr, nameEn: h.nameEn === h.nameAr ? '' : h.nameEn, from: h.from, to: h.to,
        scope: h.emps.length >= activeCount && activeCount > 0 ? 'all' : 'selected', emps: h.emps,
      }))
      .catch((e) => setMsg(e.message))
      .finally(() => setLoading(false));
  }, [id, activeCount]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setFrom = (e) => {
    const from = e.target.value;
    setForm({ ...form, from, to: form.to < from ? from : form.to });
  };

  const preset = (p) => {
    const year = (form.from || today()).slice(0, 4);
    setForm({ ...form, nameAr: p.name, ...(p.md ? { from: `${year}-${p.md}`, to: `${year}-${p.md}` } : {}) });
  };

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const path = id == null ? '/api/holidays' : `/api/holidays/${id}`;
      await api(path, { method: id == null ? 'POST' : 'PUT', body: form });
      notify(id == null ? 'تمت إضافة العطلة' : 'تم تعديل العطلة');
      onSaved();
    } catch (err) {
      setErrors(err.errors ?? {});
      if (!err.errors) setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  const days = form.from && form.to && form.to >= form.from ? dayCount(form.from, form.to) : null;
  const options = employees.map((e) => ({ id: e.code, name: `${e.code} - ${e.name}` }));

  return (
    <Modal
      wide
      title={id == null ? 'إضافة عطلة رسمية' : 'تعديل العطلة'}
      onClose={onClose}
      footer={(
        <>
          <button className="btn" form="holiday-form" disabled={busy || loading}>{busy && <Spinner />}حفظ العطلة</button>
          <button type="button" className="btn ghost" onClick={onClose}>إلغاء</button>
          {msg && <span className="err">{msg}</span>}
        </>
      )}
    >
      {loading ? <Loading /> : (
        <form id="holiday-form" onSubmit={save} noValidate>
          <div className="form-section">بيانات العطلة</div>
          <div className="grid two">
            <Field label="اسم العطلة (عربي)" error={errors.nameAr}>
              <input value={form.nameAr} onChange={set('nameAr')} placeholder="مثال: عيد الفطر المبارك" autoFocus />
            </Field>
            <Field label="الاسم بالإنجليزية (اختياري)" error={errors.nameEn}>
              <input value={form.nameEn} onChange={set('nameEn')} placeholder="Eid Al-Fitr" dir="ltr" />
            </Field>
            <Field label="من تاريخ" error={errors.from}>
              <input type="date" value={form.from} onChange={setFrom} />
            </Field>
            <Field label="إلى تاريخ" error={errors.to} hint={days ? `المدة: ${days} ${days === 1 ? 'يوم' : 'أيام'}` : undefined}>
              <input type="date" value={form.to} min={form.from} onChange={set('to')} />
            </Field>
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <span className="field-label">اختيار سريع</span>
            <div className="chips">
              {PRESETS.map((p) => <button key={p.name} type="button" className="chip suggest" onClick={() => preset(p)}>{p.name}</button>)}
            </div>
          </div>

          <div className="form-section">تطبيق العطلة على</div>
          <div className="scope-cards">
            <label className={`scope-card${form.scope === 'all' ? ' on' : ''}`}>
              <input type="radio" name="scope" checked={form.scope === 'all'} onChange={() => setForm({ ...form, scope: 'all' })} />
              <span><b>كل الموظفين النشطين</b><small>{activeCount} موظف</small></span>
            </label>
            <label className={`scope-card${form.scope === 'selected' ? ' on' : ''}`}>
              <input type="radio" name="scope" checked={form.scope === 'selected'} onChange={() => setForm({ ...form, scope: 'selected' })} />
              <span><b>موظفين محددين</b><small>اختر من القائمة</small></span>
            </label>
          </div>
          {form.scope === 'selected' && (
            <div style={{ marginTop: 14 }}>
              <OptionPicker options={options} value={form.emps} onChange={(v) => setForm({ ...form, emps: v })} placeholder="بحث بالاسم أو الكود" emptyHint="لم يتم تحديد أحد" />
              {errors.emps && <small className="err">{errors.emps}</small>}
            </div>
          )}
          <Alert tone="info">بعد حفظ العطلة، أعد «ترحيل المواعيد الفعلية» للفترة لتظهر الأيام كعطلة رسمية بدل الغياب. الأيام التي سجّل فيها الموظف بصمة تبقى حضورا.</Alert>
        </form>
      )}
    </Modal>
  );
}

export default function Holidays() {
  const [data, setData] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [q, setQ] = useState('');
  const [year, setYear] = useState('');
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new, number = edit
  const [confirm, confirmNode] = useConfirm();

  const load = () => api('/api/holidays').then(setData).catch((e) => notify(e.message, 'danger'));
  useEffect(() => {
    load();
    api('/api/employees').then((l) => setEmployees(l.filter((e) => e.status === 'ACTIVE' || e.status === 'ON_LEAVE'))).catch(() => {});
  }, []);

  const now = today();
  const years = useMemo(() => [...new Set((data?.holidays ?? []).flatMap((h) => [h.from.slice(0, 4), h.to.slice(0, 4)]))].sort().reverse(), [data]);
  const shown = useMemo(() => {
    const n = norm(q.trim());
    return (data?.holidays ?? []).filter((h) => (!year || h.from.startsWith(year) || h.to.startsWith(year)) && (!n || norm(`${h.nameAr} ${h.nameEn}`).includes(n)));
  }, [data, q, year]);

  const all = data?.holidays ?? [];
  const upcoming = all.filter((h) => h.from > now).length;
  const current = all.filter((h) => h.from <= now && h.to >= now).length;

  async function remove(h) {
    const ok = await confirm({ title: 'حذف عطلة', message: `هل تريد حذف العطلة «${h.nameAr}»؟ سيتم إلغاء ارتباطها بجميع الموظفين.`, confirmText: 'حذف', danger: true });
    if (!ok) return;
    try {
      await api(`/api/holidays/${h.id}`, { method: 'DELETE' });
      notify('تم حذف العطلة');
      load();
    } catch (err) {
      notify(err.message, 'danger');
    }
  }

  return (
    <>
      <PageHeader title="العطلات الرسمية" subtitle="الأعياد الدينية والوطنية — تُحتسب إجازة رسمية عند ترحيل المواعيد الفعلية">
        <button className="btn" onClick={() => setEditing(null)}><Icon name="plus" />إضافة عطلة</button>
      </PageHeader>

      <div className="stats">
        <Stat label="إجمالي العطلات" value={data && all.length} icon="calendar" />
        <Stat label="جارية الآن" value={data && current} tone="success" icon="check" />
        <Stat label="قادمة" value={data && upcoming} tone="info" icon="clock" />
        <Stat label="موظفين نشطين" value={data?.activeEmployees} tone="warning" icon="users" />
      </div>

      <section className="card flush">
        <div className="toolbar">
          <div className="search">
            <Icon name="search" size={16} />
            <input placeholder="بحث باسم العطلة..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="السنة">
            <option value="">كل السنوات</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          {data && <span className="result-count">{shown.length} عطلة</span>}
        </div>
        {!data ? <Loading /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>العطلة</th><th>من</th><th>إلى</th><th className="num">المدة</th><th>الموظفين</th><th>الحالة</th><th /></tr></thead>
              <tbody>
                {shown.map((h) => {
                  const p = phase(h, now);
                  return (
                    <tr key={h.id}>
                      <td>
                        <span className="strong">{h.nameAr}</span>
                        {h.nameEn && h.nameEn !== h.nameAr && <div className="muted" dir="ltr" style={{ textAlign: 'start', fontSize: 12.5 }}>{h.nameEn}</div>}
                      </td>
                      <td className="mono">{h.from}</td>
                      <td className="mono">{h.to}</td>
                      <td className="num">{h.days} {h.days === 1 ? 'يوم' : 'أيام'}</td>
                      <td>{h.employees >= data.activeEmployees && h.employees > 0 ? <Badge tone="success">كل الموظفين</Badge> : `${h.employees} موظف`}</td>
                      <td><Badge tone={p.tone}>{p.label}</Badge></td>
                      <td className="actions">
                        <button className="icon-btn" type="button" onClick={() => setEditing(h.id)} title="تعديل" aria-label={`تعديل ${h.nameAr}`}><Icon name="edit" /></button>
                        <button className="icon-btn danger" type="button" onClick={() => remove(h)} title="حذف" aria-label={`حذف ${h.nameAr}`}><Icon name="trash" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!shown.length && (
              <Empty icon="calendar" title={all.length ? 'لا توجد نتائج مطابقة' : 'لا توجد عطلات رسمية'}>
                {all.length ? 'جرّب تغيير البحث أو السنة' : 'اضغط «إضافة عطلة» لتسجيل أول عطلة'}
              </Empty>
            )}
          </div>
        )}
      </section>

      <p className="muted-note">الإجازات الأسبوعية (مثل الجمعة والسبت) تُحدَّد لكل موظف من شاشة الموظفين.</p>

      {editing !== undefined && (
        <HolidayForm
          id={editing}
          employees={employees}
          activeCount={data?.activeEmployees ?? 0}
          onClose={() => setEditing(undefined)}
          onSaved={() => { setEditing(undefined); load(); }}
        />
      )}
      {confirmNode}
    </>
  );
}
