import { useEffect, useState } from 'react';
import Loading from '../Loading.jsx';
import { api, today, dayLabel, WEEK_DAYS, STATUS_OPTIONS } from '../api.js';

const empty = () => ({
  code: '', name: '', nationalId: '', job: '', hireDate: today(), status: 'ACTIVE',
  shiftStart: '09:00', shiftEnd: '17:00', weeklyOff: [5], graceMin: 15,
});

function Field({ label, error, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error && <em className="err">{error}</em>}
    </label>
  );
}

export default function Employees() {
  const [form, setForm] = useState(empty());
  const [errors, setErrors] = useState({});
  const [list, setList] = useState(null);
  const [msg, setMsg] = useState('');

  const load = () => api('/api/employees').then(setList).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    setMsg('');
    try {
      await api('/api/employees', { method: 'POST', body: form });
      setForm(empty());
      setErrors({});
      setMsg('تم حفظ الموظف');
      load();
    } catch (err) {
      setErrors(err.errors ?? {});
      if (!err.errors) setMsg(err.message);
    }
  }

  async function remove(emp) {
    if (!confirm(`حذف الموظف ${emp.name}؟`)) return;
    try {
      await api(`/api/employees/${encodeURIComponent(emp.code)}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setMsg(err.message);
    }
  }

  return (
    <>
      <form className="card" onSubmit={save} noValidate>
        <h2>إضافة موظف</h2>
        <h3>البيانات الأساسية</h3>
        <div className="grid">
          <Field label="الكود" error={errors.code}>
            <input value={form.code} onChange={set('code')} placeholder="الكود (أرقام)" inputMode="numeric" />
          </Field>
          <Field label="الاسم" error={errors.name}>
            <input value={form.name} onChange={set('name')} placeholder="الاسم" />
          </Field>
          <Field label="رقم الهوية" error={errors.nationalId}>
            <input value={form.nationalId} onChange={set('nationalId')} placeholder="رقم الهوية" inputMode="numeric" maxLength={14} />
          </Field>
          <Field label="الوظيفة" error={errors.job}>
            <input value={form.job} onChange={set('job')} placeholder="الوظيفة" />
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

        <h3>المواعيد والإجازات والسماحية</h3>
        <div className="grid">
          <Field label="بداية الدوام" error={errors.shift}>
            <input type="time" value={form.shiftStart} onChange={set('shiftStart')} />
          </Field>
          <Field label="نهاية الدوام">
            <input type="time" value={form.shiftEnd} onChange={set('shiftEnd')} />
          </Field>
          <Field label="الإجازة الأسبوعية" error={errors.weeklyOff}>
            <select
              multiple
              size={7}
              value={form.weeklyOff.map(String)}
              onChange={(e) => setForm({ ...form, weeklyOff: [...e.target.selectedOptions].map((o) => Number(o.value)) })}
            >
              {WEEK_DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </Field>
          <Field label="السماحية بالدقائق" error={errors.graceMin}>
            <input type="number" min="0" max="60" value={form.graceMin} onChange={set('graceMin')} />
          </Field>
        </div>
        <div className="actions">
          <button className="btn" type="submit">حفظ</button>
          {msg && <span className="note">{msg}</span>}
        </div>
      </form>

      <section className="card">
        <h2>قائمة الموظفين</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>الكود</th><th>الاسم</th><th>الوظيفة</th><th>الهوية</th><th>التعيين</th><th>الحالة</th><th>الدوام</th><th>الإجازة</th><th /></tr>
            </thead>
            <tbody>
              {list?.map((e) => (
                <tr key={e.code}>
                  <td>{e.code}</td><td>{e.name}</td><td>{e.job || '-'}</td><td>{e.nationalId || '-'}</td><td>{e.hireDate ?? '-'}</td>
                  <td>{e.statusLabel}</td><td dir="ltr">{e.shiftStart ? `${e.shiftStart} - ${e.shiftEnd}` : '-'}</td>
                  <td>{e.weeklyOff.map(dayLabel).join('، ') || '-'}</td>
                  <td><button className="btn" type="button" onClick={() => remove(e)}>حذف</button></td>
                </tr>
              ))}
              {list && !list.length && <tr><td colSpan={9} className="muted">لا يوجد موظفين</td></tr>}
            </tbody>
          </table>
          {!list && <Loading />}
        </div>
      </section>
    </>
  );
}
