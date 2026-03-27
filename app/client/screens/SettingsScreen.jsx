import React, { useState, useEffect } from 'react';
import { api } from '../api.js';
import { useLang } from '../i18n/useLang.js';
import Avatar from '../components/Avatar.jsx';

const LANGS = [
  { code: 'uk', label: 'Українська' },
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
];

export default function SettingsScreen({ user, onLogout, onImpersonate, impersonating }) {
  const { t, lang, setLang } = useLang();
  const [theme, setThemeState] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark');
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const isAdmin = user.role === 'admin';

  useEffect(() => {
    if (isAdmin) {
      setLoadingUsers(true);
      api.get('/api/users').then(setUsers).finally(() => setLoadingUsers(false));
    }
  }, [isAdmin]);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    setThemeState(next);
  }

  function handleLang(code) {
    setLang(code);
  }

  return (
    <div className="screen">
      <div style={{ padding: '0 16px', paddingTop: 'calc(var(--topbar-h) + 16px)' }}>
        <h1 style={{ margin: '16px 0' }}>{t('settings.title')}</h1>
      </div>

      {/* Account */}
      <div style={{ padding: '0 16px 8px' }}>
        <div className="list-section-title">{t('settings.account')}</div>
        <div className="card">
          <div className="list-item">
            <Avatar name={user.name || user.telegram_username || '?'} size={44} />
            <div className="list-item-body">
              <div className="list-item-title">{user.name || user.telegram_username}</div>
              <div className="list-item-subtitle">{user.role}{user.telegram_username ? ` · @${user.telegram_username}` : ''}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Language */}
      <div style={{ padding: '0 16px 8px' }}>
        <div className="list-section-title">{t('settings.language')}</div>
        <div className="card">
          {LANGS.map(l => (
            <div
              key={l.code}
              className="settings-row"
              onClick={() => handleLang(l.code)}
              style={{ cursor: 'pointer' }}
            >
              <span style={{ fontSize: 15 }}>{l.label}</span>
              {lang === l.code && (
                <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 18 }}>✓</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Theme */}
      <div style={{ padding: '0 16px 8px' }}>
        <div className="list-section-title">{t('settings.theme')}</div>
        <div className="card">
          <div className="settings-row">
            <span style={{ fontSize: 15 }}>
              {theme === 'dark' ? `🌙 ${t('settings.themeDark')}` : `☀️ ${t('settings.themeLight')}`}
            </span>
            <label className="toggle">
              <input type="checkbox" checked={theme === 'dark'} onChange={toggleTheme} />
              <span className="toggle-track" />
            </label>
          </div>
        </div>
      </div>

      {/* Admin: impersonation */}
      {isAdmin && (
        <div style={{ padding: '0 16px 8px' }}>
          <div className="list-section-title">{t('settings.impersonate')}</div>
          <div className="card">
            {impersonating ? (
              <div className="settings-row" onClick={() => onImpersonate(null)} style={{ cursor: 'pointer' }}>
                <span style={{ color: 'var(--accent)', fontSize: 15 }}>{t('settings.exitImpersonate')}</span>
              </div>
            ) : loadingUsers ? (
              <div style={{ padding: 12, color: 'var(--text3)', fontSize: 14 }}>{t('loading')}</div>
            ) : (
              users.filter(u => u.id !== user.id).map(u => (
                <div
                  key={u.id}
                  className="settings-row"
                  onClick={() => onImpersonate(u)}
                  style={{ cursor: 'pointer' }}
                >
                  <div>
                    <div style={{ fontSize: 15 }}>{u.name || u.telegram_username}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>{u.role}{u.telegram_username ? ` · @${u.telegram_username}` : ''}</div>
                  </div>
                  <span className="chevron" />
                </div>
              ))
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)', padding: '4px 4px 0' }}>
            {t('settings.impersonateHint')}
          </div>
        </div>
      )}

      {/* Logout */}
      <div style={{ padding: '0 16px 32px' }}>
        <button className="btn btn-secondary btn-full" onClick={onLogout} style={{ color: 'var(--red)' }}>
          {t('settings.logout')}
        </button>
      </div>
    </div>
  );
}
