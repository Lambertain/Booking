import React, { useState } from 'react';
import { api } from '../api.js';
import { useLang } from '../i18n/useLang.js';
import LangSwitcher from '../i18n/LangSwitcher.jsx';

export default function LoginPage({ onLogin }) {
  const { t } = useLang();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.post('/api/auth/login', { email, password });
      onLogin(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
      <div className="card" style={{ width: 340 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent2)' }}>{t('auth.title')}</div>
          <LangSwitcher />
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="email" placeholder={t('auth.email')} value={email}
            onChange={e => setEmail(e.target.value)} required
          />
          <input
            type="password" placeholder={t('auth.password')} value={password}
            onChange={e => setPassword(e.target.value)} required
          />
          {error && <div className="error">{error}</div>}
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? t('auth.loggingIn') : t('auth.login')}
          </button>
        </form>
      </div>
    </div>
  );
}
