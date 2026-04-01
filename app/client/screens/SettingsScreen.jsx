import React, { useState, useEffect } from 'react';
import { api } from '../api.js';
import { useLang } from '../i18n/useLang.js';
import Avatar from '../components/Avatar.jsx';
import Sheet from '../components/Sheet.jsx';
import TopBar from '../components/TopBar.jsx';

const LANGS = [
  { code: 'uk', label: 'Українська' },
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
];

const IMPERSONATE_ROLES = [
  { role: 'manager', label: 'Manager' },
  { role: 'model',   label: 'Model' },
  { role: 'client',  label: 'Client' },
  { role: 'user',    label: 'User' },
];

export default function SettingsScreen({ user, onLogout, onImpersonate, impersonatedRole }) {
  const { t, lang, setLang } = useLang();
  const [theme, setThemeState] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark');
  const [usersView, setUsersView] = useState(false);
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [createSheet, setCreateSheet] = useState(false);
  const [assignSheet, setAssignSheet] = useState(null); // manager user
  const [modelsList, setModelsList] = useState([]);
  const [assigned, setAssigned] = useState([]);
  const [newUser, setNewUser] = useState({ name: '', role: 'manager', telegram_username: '' });
  const [creating, setCreating] = useState(false);

  const isAdmin = user.role === 'admin';

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    setThemeState(next);
  }

  async function openUsers() {
    setLoadingUsers(true);
    setUsersView(true);
    try {
      const u = await api.get('/api/users');
      setUsers(u);
    } finally {
      setLoadingUsers(false);
    }
  }

  async function createUser() {
    setCreating(true);
    try {
      const created = await api.post('/api/users', newUser);
      setUsers(u => [...u, created]);
      setCreateSheet(false);
      setNewUser({ name: '', role: 'manager', telegram_username: '' });
    } catch (err) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function toggleBlock(u) {
    const updated = await api.patch(`/api/users/${u.id}`, { is_active: !u.is_active });
    setUsers(list => list.map(x => x.id === updated.id ? { ...x, is_active: updated.is_active } : x));
  }

  async function changeRole(u, role) {
    const updated = await api.patch(`/api/users/${u.id}`, { role });
    setUsers(list => list.map(x => x.id === updated.id ? { ...x, role: updated.role } : x));
  }

  async function deleteUser(u) {
    if (!confirm(t('users.confirmDelete', { name: u.name }))) return;
    await api.delete(`/api/users/${u.id}`);
    setUsers(list => list.filter(x => x.id !== u.id));
  }

  async function openAssign(manager) {
    setAssignSheet(manager);
    const [allModels, assignedModels] = await Promise.all([
      api.get('/api/users?role=model'),
      api.get(`/api/users?manager_id=${manager.id}&role=model`),
    ]);
    setModelsList(allModels);
    setAssigned(assignedModels.map(m => m.id));
  }

  async function toggleAssign(modelId) {
    if (assigned.includes(modelId)) {
      await api.delete('/api/users/manager-models', { manager_id: assignSheet.id, model_id: modelId });
      setAssigned(a => a.filter(id => id !== modelId));
    } else {
      await api.post('/api/users/manager-models', { manager_id: assignSheet.id, model_id: modelId });
      setAssigned(a => [...a, modelId]);
    }
  }

  const ROLE_TABS = ['all', 'admin', 'manager', 'model', 'client', 'user'];
  const [roleTab, setRoleTab] = useState('all');
  const filteredUsers = roleTab === 'all' ? users : users.filter(u => u.role === roleTab);

  if (usersView) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
        <TopBar
          title="Users"
          left={<button className="back-btn" onClick={() => setUsersView(false)}>‹ {t('back')}</button>}
          right={
            <button className="btn btn-sm btn-secondary" onClick={() => setCreateSheet(true)}>
              + Add
            </button>
          }
        />
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--topbar-h) 16px 120px' }}>
          {/* Role tabs */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 12, scrollbarWidth: 'none' }}>
            {ROLE_TABS.map(r => (
              <button
                key={r}
                onClick={() => setRoleTab(r)}
                style={{
                  flexShrink: 0, padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13,
                  background: roleTab === r ? 'var(--accent)' : 'var(--bg3)',
                  color: roleTab === r ? '#fff' : 'var(--text2)',
                  fontWeight: roleTab === r ? 600 : 400,
                }}
              >
                {r === 'all' ? `All (${users.length})` : `${r.charAt(0).toUpperCase() + r.slice(1)} (${users.filter(u => u.role === r).length})`}
              </button>
            ))}
          </div>

          {loadingUsers ? (
            <div className="loader"><div className="spinner" /></div>
          ) : (
            <div className="card">
              {filteredUsers.length === 0 && (
                <div className="list-item" style={{ color: 'var(--text3)', fontSize: 13, justifyContent: 'center' }}>{t('users.noUsers')}</div>
              )}
              {filteredUsers.map(u => (
                <div key={u.id} className="list-item">
                  <Avatar name={u.name || u.telegram_username || '?'} size={40} src={u.photo_url} />
                  <div className="list-item-body">
                    <div className="list-item-title" style={{ opacity: u.is_active ? 1 : 0.4 }}>
                      {u.name || '—'}
                    </div>
                    <div className="list-item-subtitle">
                      #{u.id} · {u.role}{u.telegram_username ? ` · @${u.telegram_username}` : ''}
                      {u.created_at && ` · ${new Date(u.created_at).toLocaleDateString('uk-UA')}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <select
                      value={u.role}
                      onChange={e => changeRole(u, e.target.value)}
                      style={{ fontSize: 11, padding: '3px 6px', borderRadius: 8, border: '1px solid var(--separator)', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer' }}
                    >
                      {['user','client','model','manager','admin'].map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                    {u.role === 'manager' && (
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => openAssign(u)}
                        style={{ fontSize: 11 }}
                      >
                        Models
                      </button>
                    )}
                    {u.id !== user.id && (
                      <>
                        <button
                          className="btn btn-sm"
                          onClick={() => toggleBlock(u)}
                          style={{ fontSize: 11, background: u.is_active ? 'var(--bg4)' : 'var(--green)', color: u.is_active ? 'var(--red)' : '#fff', borderRadius: 8, padding: '4px 8px', border: 'none', cursor: 'pointer' }}
                        >
                          {u.is_active ? 'Block' : 'Unblock'}
                        </button>
                        <button
                          onClick={() => deleteUser(u)}
                          style={{ fontSize: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: '4px 2px' }}
                          title="Delete"
                        >
                          🗑
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Create user sheet */}
        <Sheet open={createSheet} onClose={() => setCreateSheet(false)} title="Add user">
          <div className="input-group">
            <div className="input-label">Name</div>
            <input value={newUser.name} onChange={e => setNewUser(u => ({ ...u, name: e.target.value }))} placeholder="Full name" />
          </div>
          <div className="input-group">
            <div className="input-label">Telegram username</div>
            <input value={newUser.telegram_username} onChange={e => setNewUser(u => ({ ...u, telegram_username: e.target.value }))} placeholder="without @" />
          </div>
          <div className="input-group">
            <div className="input-label">Role</div>
            <select value={newUser.role} onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))}>
              <option value="user">User</option>
              <option value="manager">Manager</option>
              <option value="model">Model</option>
              <option value="client">Client</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button className="btn btn-primary btn-full" onClick={createUser} disabled={creating || !newUser.name}>
            {creating ? '...' : 'Create'}
          </button>
        </Sheet>

        {/* Assign models to manager sheet */}
        <Sheet open={!!assignSheet} onClose={() => setAssignSheet(null)} title={`Assign models to ${assignSheet?.name}`}>
          <div className="card">
            {modelsList.map(m => (
              <div key={m.id} className="list-item" onClick={() => toggleAssign(m.id)} style={{ cursor: 'pointer' }}>
                <div className="list-item-body">
                  <div className="list-item-title">{m.display_name || m.name}</div>
                </div>
                <span style={{ color: assigned.includes(m.id) ? 'var(--accent)' : 'var(--text3)', fontSize: 20, fontWeight: 700 }}>
                  {assigned.includes(m.id) ? '✓' : ''}
                </span>
              </div>
            ))}
          </div>
        </Sheet>
      </div>
    );
  }

  return (
    <div className="screen">
      <div style={{ padding: '16px 16px 8px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>{t('settings.title')}</h1>
      </div>

      {/* Account */}
      <div style={{ padding: '0 16px 8px' }}>
        <div className="list-section-title">{t('settings.account')}</div>
        <div className="card">
          <div className="list-item">
            <Avatar name={user.name || user.telegram_username || '?'} size={44} />
            <div className="list-item-body">
              <div className="list-item-title">{user.name || user.telegram_username}</div>
              <div className="list-item-subtitle">
                {user.role}{user.telegram_username ? ` · @${user.telegram_username}` : ''}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Admin: users management */}
      {isAdmin && (
        <div style={{ padding: '0 16px 8px' }}>
          <div className="list-section-title">Team</div>
          <div className="card">
            <div className="settings-row" onClick={openUsers} style={{ cursor: 'pointer' }}>
              <span style={{ fontSize: 15 }}>Manage users</span>
              <span className="chevron" />
            </div>
          </div>
        </div>
      )}

      {/* Admin: view as role */}
      {isAdmin && (
        <div style={{ padding: '0 16px 8px' }}>
          <div className="list-section-title">{t('settings.impersonate')}</div>
          <div className="card">
            {impersonatedRole ? (
              <div className="settings-row" onClick={() => onImpersonate(null)} style={{ cursor: 'pointer' }}>
                <span style={{ color: 'var(--accent)', fontSize: 15 }}>{t('settings.exitImpersonate')}</span>
              </div>
            ) : (
              IMPERSONATE_ROLES.map(({ role, label }) => (
                <div key={role} className="settings-row" onClick={() => onImpersonate(role)} style={{ cursor: 'pointer' }}>
                  <span style={{ fontSize: 15 }}>View as {label}</span>
                  <span className="chevron" />
                </div>
              ))
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)', padding: '6px 4px 0' }}>
            {t('settings.impersonateHint')}
          </div>
        </div>
      )}

      {/* Language */}
      <div style={{ padding: '0 16px 8px' }}>
        <div className="list-section-title">{t('settings.language')}</div>
        <div className="card">
          {LANGS.map(l => (
            <div
              key={l.code}
              className="settings-row"
              onClick={() => setLang(l.code)}
              style={{ cursor: 'pointer' }}
            >
              <span style={{ fontSize: 15 }}>{l.label}</span>
              {lang === l.code && <span style={{ color: 'var(--accent)', fontWeight: 700 }}>✓</span>}
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
              {theme === 'dark' ? t('settings.themeDark') : t('settings.themeLight')}
            </span>
            <button
              className={`toggle${theme === 'dark' ? ' on' : ''}`}
              onClick={toggleTheme}
              aria-label="Toggle theme"
            />
          </div>
        </div>
      </div>

      {/* Logout */}
      <div style={{ padding: '0 16px 32px' }}>
        <button className="btn btn-secondary btn-full" onClick={onLogout} style={{ color: 'var(--red)' }}>
          {t('settings.logout')}
        </button>
      </div>
    </div>
  );
}
