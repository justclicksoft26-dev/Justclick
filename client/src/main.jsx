import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import Employees from './pages/Employees.jsx';
import ImportEmployees from './pages/ImportEmployees.jsx';
import Reports from './pages/Reports.jsx';
import Pull from './pages/Pull.jsx';
import Posting from './pages/Posting.jsx';
import Loading from './Loading.jsx';
import Login from './pages/Login.jsx';
import { api, getToken, setToken } from './api.js';
import './styles.css';

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
      <nav className="nav">
        <NavLink to="/employees">الموظفين</NavLink>
        <NavLink to="/import">رفع موظفين Excel</NavLink>
        <NavLink to="/pull">سحب البصمة</NavLink>
        <NavLink to="/posting">ترحيل المواعيد الفعلية</NavLink>
        <NavLink to="/reports">التقارير</NavLink>
        <span className="nav-user">{user.name || user.username}</span>
        <button className="nav-logout" onClick={logout}>خروج</button>
      </nav>
      <main className="page">
        <Routes>
          <Route path="/" element={<Navigate to="/employees" replace />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/import" element={<ImportEmployees />} />
          <Route path="/pull" element={<Pull />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/posting" element={<Posting />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')).render(<App />);
