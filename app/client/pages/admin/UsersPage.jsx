import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useLang } from '../../i18n/useLang.js';

const ROLES = ['admin', 'manager', 'model', 'client'];

export default function UsersPage() {
  const { t } = useLang();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ role: 'model', name: '', email: '', password: '', telegram_id: '', slug: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/users').then(setUsers).finally(() => setLoading(false));
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      const user = await api.post('/api/users', form);
      setUsers(u => [...u, user]);
      setShowForm(false);
      setForm({ role: 'model', name: '', email: '', password: '', telegram_id: '', slug: '' });
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleActive(u) {
    const updated = await api.patch(`/api/users/${u.id}`, { is_active: !u.is_active });
    setUsers(us => us.map(x => x.id === u.id ? { ...x, ...updated } : x));
  }

  if (loading) return <div className="loader">{t('loading')}</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div className="page-title">{t('users.title')}</div>
        <button className="btn-primary" onClick={() => setShowForm(v => !v)}>
          {showForm ? t('cancel') : `+ ${t('add')}`}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <form onSubmit={handleCreate} style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <input placeholder={t('users.name')} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            <input placeholder="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            <input placeholder={t('users.password')} type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            <input placeholder="Telegram ID" value={form.telegram_id} onChange={e => setForm(f => ({ ...f, telegram_id: e.target.value }))} />
            {form.role === 'model' && (
              <input placeholder={t('users.slugHint')} value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} />
            )}
            {error && <div className="error" style={{ gridColumn: '1/-1' }}>{error}</div>}
            <button className="btn-primary" type="submit" style={{ gridColumn: '1/-1' }}>{t('users.create')}</button>
          </form>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('users.name')}</th><th>{t('users.role')}</th><th>{t('users.email')}</th><th>Telegram</th><th>{t('users.status')}</th><th></th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td><span className="badge" style={{ background: 'var(--bg3)' }}>{u.role}</span></td>
                <td style={{ color: 'var(--text2)' }}>{u.email || '—'}</td>
                <td style={{ color: 'var(--text2)' }}>
                  {u.telegram_username ? `@${u.telegram_username}` : '—'}
                  {u.sub_status === 'blocked' && <span title={t('users.blocked')} style={{ marginLeft: 4 }}>🚫</span>}
                </td>
                <td>
                  <span className={`badge ${u.is_active ? 'badge-confirmed' : 'badge-cancelled'}`}>
                    {u.is_active ? t('users.active') : t('users.blocked')}
                  </span>
                </td>
                <td>
                  <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => toggleActive(u)}>
                    {u.is_active ? t('users.block') : t('users.unblock')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
