import { useEffect, useMemo, useState } from 'react';
import Loading from '../Loading.jsx';
import { api, norm, resetOptions } from '../api.js';
import { Badge, Empty, Field, Icon, Modal, PageHeader, Spinner, notify, useConfirm } from '../components/ui.jsx';

function ValueForm({ type, value, onClose, onSaved }) {
  const [form, setForm] = useState({ nameAr: value?.nameAr ?? '', nameEn: value?.nameEn ?? '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const path = value ? `/api/lookups/${type.id}/${value.id}` : `/api/lookups/${type.id}`;
      await api(path, { method: value ? 'PUT' : 'POST', body: form });
      resetOptions();
      notify(value ? 'تم تعديل القيمة' : 'تمت الإضافة');
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
      title={value ? `تعديل ${type.single}` : `إضافة ${type.single}`}
      onClose={onClose}
      footer={(
        <>
          <button className="btn" form="lookup-form" disabled={busy}>{busy && <Spinner />}حفظ</button>
          <button type="button" className="btn ghost" onClick={onClose}>إلغاء</button>
          {msg && <span className="err">{msg}</span>}
        </>
      )}
    >
      <form id="lookup-form" onSubmit={save} noValidate>
        <div className="grid two">
          <Field label="الاسم (عربي)" error={errors.nameAr}><input autoFocus value={form.nameAr} onChange={set('nameAr')} /></Field>
          <Field label="الاسم (إنجليزي)" error={errors.nameEn} hint="اختياري"><input value={form.nameEn} onChange={set('nameEn')} dir="ltr" /></Field>
        </div>
      </form>
    </Modal>
  );
}

export default function Lookups() {
  const [types, setTypes] = useState(null);
  const [typeId, setTypeId] = useState(12);
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(undefined); // undefined closed, null new, object edit
  const [confirm, confirmNode] = useConfirm();

  const loadTypes = () => api('/api/lookups').then(setTypes).catch((e) => notify(e.message, 'danger'));
  const loadValues = (id = typeId) => api(`/api/lookups/${id}`).then(setData).catch((e) => notify(e.message, 'danger'));
  useEffect(() => { loadTypes(); }, []);
  useEffect(() => { setData(null); setQ(''); loadValues(typeId); }, [typeId]);

  const refresh = () => { loadTypes(); loadValues(); };
  const shown = useMemo(() => {
    const n = norm(q.trim());
    return (data?.values ?? []).filter((v) => !n || norm(`${v.nameAr} ${v.nameEn}`).includes(n));
  }, [data, q]);

  async function remove(v) {
    const ok = await confirm({ title: 'حذف', message: `هل تريد حذف «${v.nameAr}»؟`, confirmText: 'حذف', danger: true });
    if (!ok) return;
    try {
      await api(`/api/lookups/${typeId}/${v.id}`, { method: 'DELETE' });
      resetOptions();
      notify('تم الحذف');
      refresh();
    } catch (err) {
      notify(err.message, 'danger');
    }
  }

  return (
    <>
      <PageHeader title="التكويد" subtitle="القوائم المستخدمة في بيانات الموظفين: الوظائف والإدارات والأقسام وغيرها">
        {data && <button className="btn" onClick={() => setEditing(null)}><Icon name="plus" />إضافة {data.type.single}</button>}
      </PageHeader>

      <div className="split">
        <nav className="card flush type-list" aria-label="أنواع التكويد">
          {!types ? <Loading /> : types.map((t) => (
            <button key={t.id} type="button" className={`type-item${t.id === typeId ? ' on' : ''}`} onClick={() => setTypeId(t.id)}>
              <span>{t.name}</span>
              <Badge tone={t.id === typeId ? 'info' : 'neutral'}>{t.count}</Badge>
            </button>
          ))}
        </nav>

        <section className="card flush">
          <div className="toolbar">
            <strong className="toolbar-title">{data?.type.name ?? '...'}</strong>
            <div className="search">
              <Icon name="search" size={16} />
              <input placeholder="بحث..." value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          {!data ? <Loading /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>الكود</th><th>الاسم</th><th>الاسم بالإنجليزية</th><th className="num">عدد الموظفين</th><th /></tr></thead>
                <tbody>
                  {shown.map((v) => (
                    <tr key={v.id}>
                      <td className="mono strong">{v.id}</td>
                      <td className="strong">{v.nameAr}</td>
                      <td dir="ltr" style={{ textAlign: 'start' }}>{v.nameEn && v.nameEn !== v.nameAr ? v.nameEn : '-'}</td>
                      <td className="num">{v.employees || '-'}</td>
                      <td className="actions">
                        <button className="icon-btn" type="button" onClick={() => setEditing(v)} title="تعديل" aria-label={`تعديل ${v.nameAr}`}><Icon name="edit" /></button>
                        <button className="icon-btn danger" type="button" onClick={() => remove(v)} title="حذف" aria-label={`حذف ${v.nameAr}`}><Icon name="trash" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!shown.length && (
                <Empty icon="file" title={data.values.length ? 'لا توجد نتائج مطابقة' : 'لا توجد قيم بعد'}>
                  {data.values.length ? 'جرّب تغيير كلمة البحث' : `اضغط «إضافة ${data.type.single}» لتسجيل أول قيمة`}
                </Empty>
              )}
            </div>
          )}
        </section>
      </div>

      {editing !== undefined && data && (
        <ValueForm type={data.type} value={editing} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); refresh(); }} />
      )}
      {confirmNode}
    </>
  );
}
