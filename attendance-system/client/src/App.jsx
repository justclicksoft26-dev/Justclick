import { useState } from 'react';
import Login from './pages/Login.jsx';
import Attendance from './pages/Attendance.jsx';
import { getToken, setToken } from './api.js';

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());

  return (
    <div className="shell">
      <div className="card">
        {authed ? (
          <Attendance
            onLogout={() => {
              setToken(null);
              setAuthed(false);
            }}
          />
        ) : (
          <Login
            onSuccess={(token) => {
              setToken(token);
              setAuthed(true);
            }}
          />
        )}
      </div>
    </div>
  );
}
