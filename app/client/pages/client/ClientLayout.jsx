import React, { useState } from 'react';
import ConversationsPage from '../manager/ConversationsPage.jsx';
import { useLang } from '../../i18n/useLang.js';
import LangSwitcher from '../../i18n/LangSwitcher.jsx';

export default function ClientLayout({ user, onLogout }) {
  const { t } = useLang();
  const [page, setPage] = useState('chat');

  const MENU = [
    { key: 'chat', label: t('nav.chat') },
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
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>{user.name}</div>
          <LangSwitcher />
          <button className="btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={onLogout}>
            {t('logout')}
          </button>
        </div>
      </aside>
      <main className="main">
        {page === 'chat' && <ConversationsPage user={user} />}
      </main>
    </div>
  );
}
