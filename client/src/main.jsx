import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import Employees from './pages/Employees.jsx';
import Pull from './pages/Pull.jsx';
import EmployeeReport from './pages/EmployeeReport.jsx';
import LateAbsentReport from './pages/LateAbsentReport.jsx';
import './styles.css';

function App() {
  return (
    <BrowserRouter>
      <nav className="nav">
        <NavLink to="/employees">الموظفين</NavLink>
        <NavLink to="/pull">سحب البصمة</NavLink>
        <NavLink to="/report/employee">تقرير الموظف</NavLink>
        <NavLink to="/report/late-absent">تقرير التأخير والغياب</NavLink>
      </nav>
      <main className="page">
        <Routes>
          <Route path="/" element={<Navigate to="/employees" replace />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/pull" element={<Pull />} />
          <Route path="/report/employee" element={<EmployeeReport />} />
          <Route path="/report/late-absent" element={<LateAbsentReport />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')).render(<App />);
