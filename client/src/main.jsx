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
import Pull from './pages/Pull.jsx';
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
    { to: '/import', label: 'رفع موظفين Excel', icon: 'upload' },
    { to: '/holidays', label: 'العطلات الرسمية', icon: 'calendar' },
    { to: '/lookups', label: 'التكويد', icon: 'file' },
  ] },
  { group: 'الحضور والانصراف', items: [
    { to: '/pull', label: 'سحب البصمة', icon: 'fingerprint' },
    { to: '/posting', label: 'ترحيل المواعيد الفعلية', icon: 'clock' },
  ] },
  { group: 'التقارير', items: [
    { to: '/reports/actual', label: 'المواعيد الفعلية', icon: 'clock' },
    { to: '/reports/late', label: 'التأخيرات والغياب', icon: 'alert' },
  ] },
];

function Shell({ user, logout }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  const initial = (user.name || user.username || '?').trim().charAt(0);

  return (
    <div className="shell">
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">JC</div>
          <div><b>Just Click</b><span>الحضور والانصراف</span></div>
        </div>
        <nav className="side-nav">
          {NAV.map((g) => (
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
          <button className="icon-btn" onClick={() => setOpen(true)} aria-label="القائمة"><Icon name="menu" /></button>
          <b>Just Click — الحضور والانصراف</b>
        </div>
        <main className="page">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/employees" element={<Employees />} />
            <Route path="/employees/:code" element={<EmployeeDetails />} />
            <Route path="/lookups" element={<Lookups />} />
            <Route path="/import" element={<ImportEmployees />} />
            <Route path="/holidays" element={<Holidays />} />
            <Route path="/pull" element={<Pull />} />
            <Route path="/reports" element={<Navigate to="/reports/actual" replace />} />
            <Route path="/reports/actual" element={<Report kind="actual" />} />
            <Route path="/reports/late" element={<Report kind="late" />} />
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
