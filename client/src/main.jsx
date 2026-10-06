import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import Employees from './pages/Employees.jsx';
import Pull from './pages/Pull.jsx';
import Posting from './pages/Posting.jsx';
import './styles.css';

function App() {
  return (
    <BrowserRouter>
      <nav className="nav">
        <NavLink to="/employees">الموظفين</NavLink>
        <NavLink to="/pull">سحب البصمة</NavLink>
        <NavLink to="/posting">ترحيل المواعيد الفعلية</NavLink>
      </nav>
      <main className="page">
        <Routes>
          <Route path="/" element={<Navigate to="/employees" replace />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/pull" element={<Pull />} />
          <Route path="/posting" element={<Posting />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')).render(<App />);
