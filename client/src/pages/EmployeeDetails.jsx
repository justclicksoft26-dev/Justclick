import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Loading from '../Loading.jsx';
import { api, getOptions, STATUS_TONE } from '../api.js';
import { Alert, Badge, Empty, Field, Icon, PageHeader, Spinner, WeekdayPicker, notify } from '../components/ui.jsx';

const SAVE_STATUS = [{ value: 'ACTIVE', label: 'نشط' }, { value: 'SUSPENDED', label: 'موقوف' }, { value: 'RESIGNED', label: 'مستقيل' }];

function LookupSelect({ options, value, onChange, required }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}>
      <option value="">{required ? '— اختر —' : '— غير محدد —'}</option>
      {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );
}

export default function EmployeeDetails() {
  const { code } = useParams();
  const nav = useNavigate();
  const [form, setForm] = useState(null);
  const [orig, setOrig] = useState(null);
  const [opts, setOpts] = useState(null);
  const [errors, setErrors] = useState({});
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    Promise.all([api(`/api/employees/${code}`), getOptions()])
      .then(([e, o]) => {
        const f = { ...e, status: e.status === 'ON_LEAVE' ? 'ACTIVE' : e.status, endDate: e.endDate ?? '', birthDate: e.birthDate ?? '' };
        setForm(f);
        setOrig(e);
        setOpts(o);
      })
      .catch((e) => (e.message === 'الموظف غير موجود' ? setMissing(true) : setMsg(e.message)));
  }, [code]);

  if (missing) return <Empty icon="users" title="الموظف غير موجود"><Link to="/employees">العودة لقائمة الموظفين</Link></Empty>;
  if (!form || !opts) return msg ? <Alert tone="danger">{msg}</Alert> : <Loading />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setVal = (k) => (v) => setForm({ ...form, [k]: v });

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    setErrors({});
    try {
      await api(`/api/employees/${code}`, { method: 'PUT', body: form });
      notify('تم حفظ بيانات الموظف');
      const fresh = await api(`/api/employees/${code}`);
      setOrig(fresh);
      setForm({ ...fresh, status: fresh.status === 'ON_LEAVE' ? 'ACTIVE' : fresh.status, endDate: fresh.endDate ?? '', birthDate: fresh.birthDate ?? '' });
    } catch (err) {
      setErrors(err.errors ?? {});
      setMsg(err.errors ? 'راجع الحقول المظللة' : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} noValidate>
      <PageHeader title={orig.name} subtitle={`كود الموظف ${orig.code}${orig.job ? ` — ${orig.job}` : ''}`}>
        <Badge tone={STATUS_TONE[orig.status]}>{orig.statusLabel}</Badge>
        <button type="button" className="btn ghost" onClick={() => nav('/employees')}>رجوع</button>
        <button className="btn" disabled={busy}>{busy ? <Spinner /> : <Icon name="check" size={16} />}حفظ التعديلات</button>
      </PageHeader>
      {msg && <Alert tone="danger">{msg}</Alert>}

      <section className="card">
        <div className="card-title"><Icon name="users" />البيانات الشخصية</div>
        <div className="grid">
          <Field label="كود الموظف" hint="لا يمكن تغيير الكود"><input value={orig.code} readOnly dir="ltr" /></Field>
          <Field label="الاسم (عربي)" error={errors.name}><input value={form.name} onChange={set('name')} /></Field>
          <Field label="الاسم (إنجليزي)" error={errors.nameEn}><input value={form.nameEn} onChange={set('nameEn')} dir="ltr" /></Field>
          <Field label="رقم الهوية" error={errors.nationalId}><input value={form.nationalId} onChange={set('nationalId')} maxLength={14} inputMode="numeric" dir="ltr" /></Field>
          <Field label="النوع" error={errors.genderId}><LookupSelect options={opts.genders} value={form.genderId} onChange={setVal('genderId')} /></Field>
          <Field label="تاريخ الميلاد" error={errors.birthDate}><input type="date" value={form.birthDate} onChange={set('birthDate')} /></Field>
          <Field label="الحالة الاجتماعية" error={errors.maritalId}><LookupSelect options={opts.marital} value={form.maritalId} onChange={setVal('maritalId')} /></Field>
          <Field label="الموقف من التجنيد" error={errors.militaryId}><LookupSelect options={opts.military} value={form.militaryId} onChange={setVal('militaryId')} /></Field>
          <Field label="المؤهل الدراسي" error={errors.qualId}><LookupSelect options={opts.qualifications} value={form.qualId} onChange={setVal('qualId')} /></Field>
        </div>
      </section>

      <section className="card">
        <div className="card-title"><Icon name="info" />بيانات الاتصال</div>
        <div className="grid">
          <Field label="موبايل 1" error={errors.mobile1}><input value={form.mobile1} onChange={set('mobile1')} dir="ltr" inputMode="tel" /></Field>
          <Field label="موبايل 2" error={errors.mobile2}><input value={form.mobile2} onChange={set('mobile2')} dir="ltr" inputMode="tel" /></Field>
          <Field label="البريد الإلكتروني" error={errors.email}><input value={form.email} onChange={set('email')} dir="ltr" inputMode="email" /></Field>
          <Field label="العنوان" error={errors.address} className="span-all"><input value={form.address} onChange={set('address')} /></Field>
        </div>
      </section>

      <section className="card">
        <div className="card-title"><Icon name="chart" />بيانات الوظيفة</div>
        <div className="grid">
          <Field label="الوظيفة" error={errors.job ?? errors.jobId}><LookupSelect required options={opts.jobs} value={form.jobId} onChange={setVal('jobId')} /></Field>
          <Field label="الإدارة" error={errors.deptId}><LookupSelect options={opts.depts} value={form.deptId} onChange={setVal('deptId')} /></Field>
          <Field label="القسم" error={errors.sectionId}><LookupSelect options={opts.sections} value={form.sectionId} onChange={setVal('sectionId')} /></Field>
          <Field label="مركز التكلفة" error={errors.costCenterId}><LookupSelect options={opts.costCenters} value={form.costCenterId} onChange={setVal('costCenterId')} /></Field>
          <Field label="فئة الموظف" error={errors.categoryId}><LookupSelect options={opts.categories} value={form.categoryId} onChange={setVal('categoryId')} /></Field>
          <Field label="نوع العقد" error={errors.contractId}><LookupSelect options={opts.contracts} value={form.contractId} onChange={setVal('contractId')} /></Field>
          <Field label="تاريخ التعيين" error={errors.hireDate}><input type="date" value={form.hireDate ?? ''} onChange={set('hireDate')} /></Field>
          <Field label="الحالة" error={errors.status}>
            <select value={form.status} onChange={set('status')}>
              {SAVE_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          {form.status === 'RESIGNED' && (
            <Field label="تاريخ ترك العمل" error={errors.endDate}><input type="date" value={form.endDate} onChange={set('endDate')} /></Field>
          )}
        </div>
        <p className="muted-note">القيم مصدرها شاشة <Link to="/lookups">التكويد</Link>. «في إجازة» تُحسب تلقائيا من الإجازات المسجلة ولا تُختار هنا.</p>
      </section>

      <section className="card">
        <div className="card-title"><Icon name="clock" />الدوام والإجازات</div>
        <div className="grid">
          <Field label="بداية الدوام" error={errors.shift}><input type="time" value={form.shiftStart ?? ''} onChange={set('shiftStart')} /></Field>
          <Field label="نهاية الدوام"><input type="time" value={form.shiftEnd ?? ''} onChange={set('shiftEnd')} /></Field>
          <Field label="السماحية بالدقائق" error={errors.graceMin} hint="من 0 إلى 60 دقيقة"><input type="number" min="0" max="60" value={form.graceMin} onChange={set('graceMin')} /></Field>
          <div className="field span-all">
            <span className="field-label">الإجازة الأسبوعية <span className="muted">(يمكن اختيار أكثر من يوم)</span></span>
            <WeekdayPicker value={form.weeklyOff} onChange={setVal('weeklyOff')} />
            {errors.weeklyOff && <small className="err">{errors.weeklyOff}</small>}
          </div>
        </div>
        <p className="muted-note">تغيير الدوام يسري من اليوم، ويُحفظ الدوام السابق كما هو للفترات الماضية. أعد ترحيل المواعيد الفعلية بعد أي تعديل.</p>
      </section>

      <section className="card">
        <div className="card-title"><Icon name="file" />ملاحظات</div>
        <Field label="ملاحظات" error={errors.notes}><textarea rows={3} value={form.notes} onChange={set('notes')} /></Field>
      </section>
    </form>
  );
}
