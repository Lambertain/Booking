import React, { useState, useEffect } from 'react';
import { api, setToken, clearToken } from './api.js';
import { useLang } from './i18n/useLang.js';
import TabBar from './components/TabBar.jsx';

import ModelsScreen from './screens/ModelsScreen.jsx';
import ChatsScreen from './screens/ChatsScreen.jsx';
import ClientsScreen from './screens/ClientsScreen.jsx';
import SettingsScreen from './screens/SettingsScreen.jsx';
import AnalyticsScreen from './screens/AnalyticsScreen.jsx';

import LoginPage from './pages/LoginPage.jsx';

// Init theme from localStorage
const savedTheme = localStorage.getItem('theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);

// SF Symbols–style SVG icons
const Icons = {
  models: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="7" r="4"/>
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>
  ),
  chats: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  clients: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <rect x="3" y="5" width="18" height="14" rx="2"/>
      <path d="M3 9h18M8 5V3m8 2V3"/>
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
  myshoot: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="15" rx="2"/>
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
      <circle cx="12" cy="14" r="3"/>
    </svg>
  ),
  orders: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
      <rect x="9" y="3" width="6" height="4" rx="1"/>
      <path d="M9 12h6M9 16h4"/>
    </svg>
  ),
  analytics: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M7 16l3-4 3 3 3-5"/>
    </svg>
  ),
};

export default function App() {
  const { t } = useLang();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('models');
  const [impersonatedRole, setImpersonatedRole] = useState(null); // 'manager'|'model'|'client'|null
  const [unreadCount, setUnreadCount] = useState(0);
  const [chatActive, setChatActive] = useState(false);

  // Effective role for UI rendering
  const effectiveRole = impersonatedRole || user?.role;
  // Effective user: same user but with overridden role
  const effectiveUser = user ? { ...user, role: effectiveRole } : null;

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

  // Poll unread every 30s
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
    setImpersonatedRole(null);
  }

  function onImpersonate(role) {
    setImpersonatedRole(role);
    setTab(role === 'client' ? 'clients' : 'models');
  }

  if (loading) return <div className="loader"><div className="spinner" /></div>;
  if (!user) return <LoginPage onLogin={onLogin} />;

  // Build tabs per effective role
  const tabs = [];
  if (effectiveRole === 'admin' || effectiveRole === 'manager') {
    tabs.push({ key: 'models',    icon: Icons.models,    label: t('nav.models') });
    tabs.push({ key: 'clients',   icon: Icons.clients,   label: t('nav.clients') });
    tabs.push({ key: 'chats',     icon: Icons.chats,     label: t('nav.chats') });
    tabs.push({ key: 'analytics', icon: Icons.analytics, label: t('analytics.nav') });
    tabs.push({ key: 'settings',  icon: Icons.settings,  label: t('nav.settings') });
  } else if (effectiveRole === 'model') {
    tabs.push({ key: 'models',   icon: Icons.myshoot,  label: t('nav.myShoot2') });
    tabs.push({ key: 'chats',    icon: Icons.chats,    label: t('nav.chats') });
    tabs.push({ key: 'settings', icon: Icons.settings, label: t('nav.settings') });
  } else if (effectiveRole === 'client') {
    tabs.push({ key: 'clients',  icon: Icons.orders,   label: t('nav.clients') });
    tabs.push({ key: 'chats',    icon: Icons.chats,    label: t('nav.chats') });
    tabs.push({ key: 'settings', icon: Icons.settings, label: t('nav.settings') });
  } else if (effectiveRole === 'user') {
    tabs.push({ key: 'chats',    icon: Icons.chats,    label: t('nav.chats') });
    tabs.push({ key: 'settings', icon: Icons.settings, label: t('nav.settings') });
  }

  const validTab = tabs.find(tb => tb.key === tab) ? tab : tabs[0]?.key;

  function renderScreen() {
    switch (validTab) {
      case 'models':   return <ModelsScreen user={effectiveUser} />;
      case 'chats':    return <ChatsScreen user={effectiveUser} onUnreadChange={setUnreadCount} onChatActive={setChatActive} />;
      case 'clients':   return <ClientsScreen user={effectiveUser} />;
      case 'analytics': return <AnalyticsScreen user={effectiveUser} />;
      case 'settings':
        return (
          <SettingsScreen
            user={user}
            onLogout={onLogout}
            onImpersonate={onImpersonate}
            impersonatedRole={impersonatedRole}
          />
        );
      default: return null;
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden' }}>
      {/* Impersonation banner */}
      {impersonatedRole && (
        <div style={{
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
        }}>
          <span>View as: {impersonatedRole}</span>
          <button
            onClick={() => { setImpersonatedRole(null); setTab('models'); }}
            style={{ background: 'rgba(255,255,255,0.25)', border: 'none', borderRadius: 8, color: '#fff', padding: '3px 10px', fontSize: 12, cursor: 'pointer' }}
          >
            ✕ Exit
          </button>
        </div>
      )}

      {/* Main scrollable content */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
        {renderScreen()}
      </div>

      {/* Bottom TabBar */}
      {!chatActive && (
        <TabBar
          tabs={tabs}
          active={validTab}
          onChange={setTab}
          badges={{ chats: unreadCount }}
        />
      )}
    </div>
  );
}
