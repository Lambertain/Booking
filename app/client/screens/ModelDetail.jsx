import React, { useState } from 'react';
import { api } from '../api.js';
import { useLang } from '../i18n/useLang.js';
import Avatar from '../components/Avatar.jsx';
import CalendarView from './CalendarView.jsx';
import ShootsList from './ShootsList.jsx';
import TopBar from '../components/TopBar.jsx';

export default function ModelDetail({ model, shoots, onBack, canEdit, onShootUpdated }) {
  const { t } = useLang();
  const [tab, setTab] = useState('calendar');

  return (
    <div className="screen" style={{ paddingTop: 0 }}>
      <TopBar
        title={model.display_name || model.name}
        left={<button className="back-btn" onClick={onBack}>‹ {t('back')}</button>}
      />
      <div style={{ paddingTop: 'var(--topbar-h)' }}>
        {/* Model header */}
        <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <Avatar name={model.name} size={64} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{model.display_name || model.name}</div>
            {model.telegram_username && (
              <div style={{ fontSize: 14, color: 'var(--text2)' }}>@{model.telegram_username}</div>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 1, padding: '0 16px 16px' }}>
          {[
            { label: t('shoots.all'), value: shoots.length },
            { label: t('shoots.statusLabels.confirmed'), value: shoots.filter(s => s.status === 'confirmed').length, color: 'var(--green)' },
            { label: t('shoots.statusLabels.done'), value: shoots.filter(s => s.status === 'done').length, color: 'var(--accent)' },
          ].map(s => (
            <div key={s.label} className="card" style={{ flex: 1, padding: '12px', textAlign: 'center', marginRight: 8 }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: s.color || 'var(--text)' }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Segmented control */}
        <div style={{ padding: '0 16px 8px' }}>
          <div className="segmented">
            <button className={`segmented-btn ${tab === 'calendar' ? 'active' : ''}`} onClick={() => setTab('calendar')}>
              📅 {t('shoots.calendar')}
            </button>
            <button className={`segmented-btn ${tab === 'list' ? 'active' : ''}`} onClick={() => setTab('list')}>
              📋 {t('shoots.list')}
            </button>
          </div>
        </div>

        {tab === 'calendar'
          ? <CalendarView shoots={shoots} />
          : <ShootsList shoots={shoots} canEdit={canEdit} onShootUpdated={onShootUpdated} />
        }
      </div>
    </div>
  );
}
