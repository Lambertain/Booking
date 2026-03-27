import React, { useState, useEffect } from 'react';
import { api, setToken, clearToken } from './api.js';
import LoginPage from './pages/LoginPage.jsx';
import AdminLayout from './pages/admin/AdminLayout.jsx';
import ManagerLayout from './pages/manager/ManagerLayout.jsx';
import ModelLayout from './pages/model/ModelLayout.jsx';
import ClientLayout from './pages/client/ClientLayout.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Try Telegram initData first (TWA)
    const tg = window.Telegram?.WebApp;
    if (tg?.initData) {
      api.post('/api/auth/tg', { initData: tg.initData })
        .then(data => { setToken(data.token); setUser(data.user); })
        .catch(() => loadFromToken())
        .finally(() => setLoading(false));
    } else {
      loadFromToken();
    }
  }, []);

  function loadFromToken() {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    api.get('/api/auth/me')
      .then(data => setUser(data.user))
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }

  function onLogin(data) {
    setToken(data.token);
    setUser(data.user);
  }

  function onLogout() {
    clearToken();
    setUser(null);
  }

  if (loading) return <div className="loader">Завантаження...</div>;
  if (!user) return <LoginPage onLogin={onLogin} />;

  const props = { user, onLogout };
  if (user.role === 'admin')   return <AdminLayout {...props} />;
  if (user.role === 'manager') return <ManagerLayout {...props} />;
  if (user.role === 'model')   return <ModelLayout {...props} />;
  if (user.role === 'client')  return <ClientLayout {...props} />;

  return <div className="loader">Невідома роль: {user.role}</div>;
}
