import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Employees from './pages/Employees.jsx';
import ImportEmployees from './pages/ImportEmployees.jsx';
import Holidays from './pages/Holidays.jsx';
import Report from './pages/Report.jsx';
import Dashboard from './pages/Dashboard.jsx';
import EmployeeDetails from './pages/EmployeeDetails.jsx';
import Lookups from './pages/Lookups.jsx';
// import Pull from './pages/Pull.jsx'; // screen hidden, see NAV and the routes below
import Posting from './pages/Posting.jsx';
import Loading from './Loading.jsx';
import Login from './pages/Login.jsx';
import { Icon, Toaster } from './components/ui.jsx';
import { api, getToken, setToken } from './api.js';
import './styles.css';

const NAV = [
  { group: '', items: [{ to: '/', label: 'لوحة المتابعة', icon: 'chart', end: true }] },
  { group: 'الموارد البشرية', items: [
    { to: '/employees', label: 'الموظفين', icon: 'users' },
    { to: '/import', label: 'رفع موظفين Excel', icon: 'upload', admin: true },
    { to: '/holidays', label: 'العطلات الرسمية', icon: 'calendar', admin: true },
  ] },
  { group: 'الحضور والانصراف', items: [
    // hidden for now (route closed too); the screen's code stays in pages/Pull.jsx
    // { to: '/pull', label: 'سحب البصمة', icon: 'fingerprint', admin: true },
    { to: '/posting', label: 'ترحيل المواعيد الفعلية', icon: 'clock' },
  ] },
  { group: 'التقارير', items: [
    { to: '/reports/actual', label: 'المواعيد الفعلية', icon: 'clock' },
    { to: '/reports/late', label: 'التأخيرات والغياب', icon: 'alert' },
    { to: '/reports/late-only', label: 'التأخيرات اليومية', icon: 'clock' },
  ] },
];

function Shell({ user, logout }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === '1'; } catch { return false; }
  });
  const { pathname } = useLocation();
  // report pages start with the sidebar closed; the menu button still opens it by hand
  const onReport = pathname.startsWith('/reports');
  const [reportOpen, setReportOpen] = useState(false);
  useEffect(() => { setOpen(false); setReportOpen(false); }, [pathname]);
  const toggleMenu = () => {
    if (window.matchMedia('(max-width: 960px)').matches) return setOpen((o) => !o);
    if (onReport) return setReportOpen((o) => !o);
    setCollapsed((c) => {
      try { localStorage.setItem('sidebar-collapsed', c ? '0' : '1'); } catch { /* storage unavailable */ }
      return !c;
    });
  };
  const hidden = onReport ? !reportOpen : collapsed;
  const initial = (user.name || user.username || '?').trim().charAt(0);

  return (
    <div className={`shell${hidden ? ' collapsed' : ''}`}>
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><img src="/logo.png" alt="شركة الأفق التعليمية" /></div>
          <div><b>الحضور والانصراف</b><span>نظام الموارد البشرية</span></div>
        </div>
        <nav className="side-nav">
          {NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.admin || user.isAdmin) })).filter((g) => g.items.length).map((g) => (
            <div key={g.group}>
              {g.group && <div className="side-group">{g.group}</div>}
              {g.items.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.end} className="side-link"><Icon name={i.icon} />{i.label}</NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-user">
          <span className="avatar">{initial}</span>
          <span className="side-user-name">{user.name || user.username}</span>
          <button className="icon-btn" onClick={logout} title="تسجيل الخروج" aria-label="تسجيل الخروج"><Icon name="logout" /></button>
        </div>
      </aside>
      <div className={`scrim${open ? ' open' : ''}`} onClick={() => setOpen(false)} />
      <div className="content">
        <div className="topbar">
          <button className="icon-btn" onClick={toggleMenu} aria-label="فتح أو إغلاق القائمة" aria-expanded={!hidden}><Icon name="menu" /></button>
          <b>الحضور والانصراف</b>
        </div>
        <main className="page">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/employees" element={<Employees />} />
            <Route path="/employees/:code" element={<EmployeeDetails />} />
            {user.isAdmin && <Route path="/lookups" element={<Lookups />} />}
            {user.isAdmin && <Route path="/import" element={<ImportEmployees />} />}
            {user.isAdmin && <Route path="/holidays" element={<Holidays />} />}
            {/* {user.isAdmin && <Route path="/pull" element={<Pull />} />} */}
            <Route path="/reports" element={<Navigate to="/reports/actual" replace />} />
            <Route path="/reports/actual" element={<Report key="actual" kind="actual" />} />
            <Route path="/reports/late" element={<Report key="late" kind="late" />} />
            <Route path="/reports/late-only" element={<Report key="lateOnly" kind="lateOnly" />} />
            <Route path="/posting" element={<Posting />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(!!getToken());

  useEffect(() => {
    if (getToken()) api('/api/auth/me').then(setUser).catch(() => {}).finally(() => setChecking(false));
    const expired = () => setUser(null);
    window.addEventListener('auth-expired', expired);
    return () => window.removeEventListener('auth-expired', expired);
  }, []);

  const logout = () => { setToken(null); setUser(null); };

  if (checking) return <Loading />;
  if (!user) return <Login onLogin={setUser} />;

  return (
    <BrowserRouter>
      <Shell user={user} logout={logout} />
      <Toaster />
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')).render(<App />);
