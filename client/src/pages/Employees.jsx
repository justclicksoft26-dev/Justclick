import { useEffect, useMemo, useState } from 'react';
import Loading from '../Loading.jsx';
import { Link } from 'react-router-dom';
import { api, getOptions, today, dayLabel, norm, STATUS_OPTIONS, STATUS_TONE } from '../api.js';
import { Badge, Empty, Field, Icon, Modal, PageHeader, Spinner, Stat, WeekdayPicker, notify, useConfirm } from '../components/ui.jsx';

const empty = () => ({
  code: '', name: '', nationalId: '', jobId: '', deptId: '', hireDate: today(), status: 'ACTIVE',
  shiftStart: '09:00', shiftEnd: '17:00', weeklyOff: [5], graceMin: 15,
});

function EmployeeForm({ onClose, onSaved }) {
  const [form, setForm] = useState(empty());
  const [errors, setErrors] = useState({});
  const [autoCode, setAutoCode] = useState(true);
  const [nextCode, setNextCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [opts, setOpts] = useState({ jobs: [], depts: [] });

  useEffect(() => {
    api('/api/employees/next-code').then((r) => setNextCode(r.code)).catch(() => {});
    getOptions().then(setOpts).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const r = await api('/api/employees', { method: 'POST', body: { ...form, code: autoCode ? '' : form.code } });
      notify(`تم حفظ الموظف بالكود ${r.code}`);
      onSaved();
    } catch (err) {
      setErrors(err.errors ?? {});
      if (!err.errors) setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      wide
      title="إضافة موظف"
      onClose={onClose}
      footer={(
        <>
          <button className="btn" form="emp-form" disabled={busy}>{busy && <Spinner />}حفظ الموظف</button>
          <button type="button" className="btn ghost" onClick={onClose}>إلغاء</button>
          {msg && <span className="err">{msg}</span>}
        </>
      )}
    >
      <form id="emp-form" onSubmit={save} noValidate>
        <div className="form-section">البيانات الأساسية</div>
        <div className="grid">
          <Field label="كود الموظف" error={errors.code} hint={autoCode ? 'يتم توليده تلقائيا بالتسلسل' : 'نفس كود الموظف على جهاز البصمة'}>
            <div className="code-row">
              {autoCode
                ? <input readOnly value={nextCode} placeholder="..." dir="ltr" />
                : <input value={form.code} onChange={set('code')} placeholder="اكتب الكود" inputMode="numeric" dir="ltr" autoFocus />}
              <span className="seg">
                <button type="button" className={autoCode ? 'on' : ''} onClick={() => setAutoCode(true)}>تلقائي</button>
                <button type="button" className={!autoCode ? 'on' : ''} onClick={() => setAutoCode(false)}>يدوي</button>
              </span>
            </div>
          </Field>
          <Field label="الاسم" error={errors.name}>
            <input value={form.name} onChange={set('name')} placeholder="الاسم بالعربية" autoFocus={autoCode} />
          </Field>
          <Field label="رقم الهوية" error={errors.nationalId}>
            <input value={form.nationalId} onChange={set('nationalId')} placeholder="14 رقم" inputMode="numeric" maxLength={14} dir="ltr" />
          </Field>
          <Field label="الوظيفة" error={errors.job} hint={opts.jobs.length ? undefined : 'أضف وظائف من شاشة التكويد أولا'}>
            <select value={form.jobId} onChange={set('jobId')}>
              <option value="">— اختر الوظيفة —</option>
              {opts.jobs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
          <Field label="الإدارة">
            <select value={form.deptId} onChange={set('deptId')}>
              <option value="">— غير محدد —</option>
              {opts.depts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
          <Field label="تاريخ التعيين" error={errors.hireDate}>
            <input type="date" value={form.hireDate} onChange={set('hireDate')} />
          </Field>
          <Field label="الحالة" error={errors.status}>
            <select value={form.status} onChange={set('status')}>
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
        </div>

        <div className="form-section">الدوام والإجازات</div>
        <div className="grid">
          <Field label="بداية الدوام" error={errors.shift}>
            <input type="time" value={form.shiftStart} onChange={set('shiftStart')} />
          </Field>
          <Field label="نهاية الدوام">
            <input type="time" value={form.shiftEnd} onChange={set('shiftEnd')} />
          </Field>
          <Field label="السماحية بالدقائق" error={errors.graceMin} hint="من 0 إلى 60 دقيقة">
            <input type="number" min="0" max="60" value={form.graceMin} onChange={set('graceMin')} />
          </Field>
          <div className="field span-all">
            <span className="field-label">الإجازة الأسبوعية <span className="muted">(يمكن اختيار أكثر من يوم)</span></span>
            <WeekdayPicker value={form.weeklyOff} onChange={(v) => setForm({ ...form, weeklyOff: v })} />
            {errors.weeklyOff && <small className="err">{errors.weeklyOff}</small>}
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default function Employees() {
  const [list, setList] = useState(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [adding, setAdding] = useState(false);
  const [confirm, confirmNode] = useConfirm();

  const load = () => api('/api/employees').then(setList).catch((e) => notify(e.message, 'danger'));
  useEffect(() => { load(); }, []);

  const shown = useMemo(() => {
    const n = norm(q.trim());
    return (list ?? []).filter((e) => (!status || e.status === status)
      && (!n || norm(`${e.name} ${e.code} ${e.job} ${e.nationalId}`).includes(n)));
  }, [list, q, status]);

  const count = (s) => (list ?? []).filter((e) => e.status === s).length;

  async function remove(emp) {
    const ok = await confirm({ title: 'حذف موظف', message: `هل تريد حذف الموظف «${emp.name}»؟ لا يمكن التراجع عن هذا الإجراء.`, confirmText: 'حذف', danger: true });
    if (!ok) return;
    try {
      await api(`/api/employees/${encodeURIComponent(emp.code)}`, { method: 'DELETE' });
      notify('تم حذف الموظف');
      load();
    } catch (err) {
      notify(err.message, 'danger');
    }
  }

  return (
    <>
      <PageHeader title="الموظفين" subtitle="إدارة بيانات الموظفين ومواعيد الدوام والإجازات الأسبوعية">
        <button className="btn" onClick={() => setAdding(true)}><Icon name="plus" />إضافة موظف</button>
      </PageHeader>

      <div className="stats">
        <Stat label="إجمالي الموظفين" value={list?.length} icon="users" />
        <Stat label="نشط" value={list && count('ACTIVE')} tone="success" icon="check" />
        <Stat label="في إجازة" value={list && count('ON_LEAVE')} tone="info" icon="calendar" />
        <Stat label="موقوف / مستقيل" value={list && count('SUSPENDED') + count('RESIGNED')} tone="warning" icon="alert" />
      </div>

      <section className="card flush">
        <div className="toolbar">
          <div className="search">
            <Icon name="search" size={16} />
            <input placeholder="بحث بالاسم أو الكود أو الوظيفة..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="تصفية بالحالة">
            <option value="">كل الحالات</option>
            <option value="ACTIVE">نشط</option>
            <option value="ON_LEAVE">في إجازة</option>
            <option value="SUSPENDED">موقوف</option>
            <option value="RESIGNED">مستقيل</option>
          </select>
          {list && <span className="result-count">{shown.length} من {list.length} موظف</span>}
        </div>
        {!list ? <Loading /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>الكود</th><th>الاسم</th><th>الوظيفة</th><th>الهوية</th><th>التعيين</th><th>الحالة</th><th>الدوام</th><th>الإجازة الأسبوعية</th><th /></tr>
              </thead>
              <tbody>
                {shown.map((e) => (
                  <tr key={e.code}>
                    <td className="mono strong">{e.code}</td>
                    <td className="strong"><Link className="row-link" to={`/employees/${e.code}`}>{e.name}</Link></td>
                    <td>{e.job || '-'}</td>
                    <td className="mono">{e.nationalId || '-'}</td>
                    <td className="mono">{e.hireDate ?? '-'}</td>
                    <td><Badge tone={STATUS_TONE[e.status]}>{e.statusLabel}</Badge></td>
                    <td dir="ltr" className="mono">{e.shiftStart ? `${e.shiftStart} - ${e.shiftEnd}` : '-'}</td>
                    <td>
                      {e.weeklyOff.length
                        ? <div className="tag-list">{e.weeklyOff.map((d) => <span key={d} className="tag">{dayLabel(d)}</span>)}</div>
                        : '-'}
                    </td>
                    <td className="actions">
                      <Link className="icon-btn" to={`/employees/${e.code}`} title="عرض / تعديل" aria-label={`عرض وتعديل ${e.name}`}><Icon name="edit" /></Link>
                      <button className="icon-btn danger" type="button" onClick={() => remove(e)} title="حذف" aria-label={`حذف ${e.name}`}><Icon name="trash" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!shown.length && (
              <Empty icon="search" title={list.length ? 'لا توجد نتائج مطابقة' : 'لا يوجد موظفين بعد'}>
                {list.length ? 'جرّب تغيير كلمة البحث أو الحالة' : 'اضغط «إضافة موظف» لتسجيل أول موظف'}
              </Empty>
            )}
          </div>
        )}
      </section>

      {adding && <EmployeeForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
      {confirmNode}
    </>
  );
}
