import React, { useState, useEffect } from 'react';
import { api, setToken, clearToken } from './api.js';
import { useLang } from './i18n/useLang.js';
import TabBar from './components/TabBar.jsx';
import TopBar from './components/TopBar.jsx';

import ModelsScreen from './screens/ModelsScreen.jsx';
import ChatsScreen from './screens/ChatsScreen.jsx';
import ClientsScreen from './screens/ClientsScreen.jsx';
import SettingsScreen from './screens/SettingsScreen.jsx';

import LoginPage from './pages/LoginPage.jsx';

// Init theme from localStorage
const savedTheme = localStorage.getItem('theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);

export default function App() {
  const { t } = useLang();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('models');
  const [impersonated, setImpersonated] = useState(null); // { user, originalUser }
  const [unreadCount, setUnreadCount] = useState(0);

  const effectiveUser = impersonated?.user || user;

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg?.initData) {
      tg.expand();
      api.post('/api/auth/tg', { initData: tg.initData })
        .then(data => { setToken(data.token); setUser(data.user); })
        .catch(() => loadFromToken())
        .finally(() => setLoading(false));
    } else {
      loadFromToken();
    }
  }, []);

  // Poll unread count every 30s
  useEffect(() => {
    if (!effectiveUser) return;
    function fetchUnread() {
      api.get('/api/conversations').then(convs => {
        const total = convs.reduce((s, c) => s + (parseInt(c.unread) || 0), 0);
        setUnreadCount(total);
      }).catch(() => {});
    }
    fetchUnread();
    const iv = setInterval(fetchUnread, 30000);
    return () => clearInterval(iv);
  }, [effectiveUser?.id]);

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
    setImpersonated(null);
  }

  function onImpersonate(targetUser) {
    if (!targetUser) {
      setImpersonated(null);
      setTab('models');
    } else {
      setImpersonated({ user: targetUser, originalUser: user });
      setTab('models');
    }
  }

  if (loading) return <div className="loader"><div className="spinner" /></div>;
  if (!user) return <LoginPage onLogin={onLogin} />;

  const role = effectiveUser.role;

  // Build tabs per role
  const tabs = [];
  if (role === 'admin' || role === 'manager') {
    tabs.push({ key: 'models', icon: '👤', label: t('nav.models') });
    tabs.push({ key: 'chats', icon: '💬', label: t('nav.chats') });
    tabs.push({ key: 'clients', icon: '📋', label: t('nav.clients') });
    tabs.push({ key: 'settings', icon: '⚙️', label: t('nav.settings') });
  } else if (role === 'model') {
    tabs.push({ key: 'models', icon: '🎬', label: t('nav.myShoot') });
    tabs.push({ key: 'chats', icon: '💬', label: t('nav.chats') });
    tabs.push({ key: 'settings', icon: '⚙️', label: t('nav.settings') });
  } else if (role === 'client') {
    tabs.push({ key: 'clients', icon: '📋', label: t('nav.clients') });
    tabs.push({ key: 'chats', icon: '💬', label: t('nav.chats') });
    tabs.push({ key: 'settings', icon: '⚙️', label: t('nav.settings') });
  }

  // Make sure current tab is valid for this role
  const validTab = tabs.find(t => t.key === tab) ? tab : tabs[0]?.key;

  function renderScreen() {
    switch (validTab) {
      case 'models':
        return <ModelsScreen user={effectiveUser} />;
      case 'chats':
        return <ChatsScreen user={effectiveUser} onUnreadChange={setUnreadCount} />;
      case 'clients':
        return <ClientsScreen user={effectiveUser} />;
      case 'settings':
        return (
          <SettingsScreen
            user={user}
            onLogout={onLogout}
            onImpersonate={onImpersonate}
            impersonating={!!impersonated}
          />
        );
      default:
        return null;
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden' }}>
      {/* Impersonation banner */}
      {impersonated && (
        <div
          style={{
            background: 'var(--accent)',
            color: '#fff',
            textAlign: 'center',
            padding: '6px 16px',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            zIndex: 200,
          }}
        >
          <span>👁 {impersonated.user.name || impersonated.user.telegram_username} ({impersonated.user.role})</span>
          <button
            onClick={() => onImpersonate(null)}
            style={{ background: 'rgba(255,255,255,0.25)', border: 'none', borderRadius: 8, color: '#fff', padding: '3px 10px', fontSize: 12, cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Main content area */}
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 'var(--tabbar-h)' }}>
        {renderScreen()}
      </div>

      {/* Bottom tab bar */}
      <TabBar
        tabs={tabs}
        active={validTab}
        onChange={setTab}
        badges={{ chats: unreadCount }}
      />
    </div>
  );
}
