import React, { useState } from 'react';
import ShootsPage from './ShootsPage.jsx';
import ConversationsPage from './ConversationsPage.jsx';
import { useLang } from '../../i18n/useLang.js';
import LangSwitcher from '../../i18n/LangSwitcher.jsx';

export default function ManagerLayout({ user, onLogout }) {
  const { t } = useLang();
  const [page, setPage] = useState('shoots');

  const MENU = [
    { key: 'shoots',        label: t('nav.shoots') },
    { key: 'conversations', label: t('nav.conversations') },
  ];

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="logo">Lambertain</div>
        <nav>
          {MENU.map(m => (
            <a key={m.key} href="#" className={page === m.key ? 'active' : ''}
               onClick={e => { e.preventDefault(); setPage(m.key); }}>
              {m.label}
            </a>
          ))}
        </nav>
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>{user.name} · manager</div>
          <LangSwitcher />
          <button className="btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={onLogout}>
            {t('logout')}
          </button>
        </div>
      </aside>
      <main className="main">
        {page === 'shoots'        && <ShootsPage user={user} />}
        {page === 'conversations' && <ConversationsPage user={user} />}
      </main>
    </div>
  );
}
