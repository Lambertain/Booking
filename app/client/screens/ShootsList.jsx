import React, { useState } from 'react';
import { useLang } from '../i18n/useLang.js';
import ShootSheet from '../components/ShootSheet.jsx';

const STATUSES = ['all', 'negotiating', 'confirmed', 'done', 'cancelled'];

export default function ShootsList({ shoots, canEdit, onShootUpdated }) {
  const { t } = useLang();
  const [filter, setFilter] = useState('all');
  const [detailShoot, setDetailShoot] = useState(null);

  const filtered = filter === 'all' ? shoots : shoots.filter(s => s.status === filter);
  const sorted = [...filtered].sort((a, b) => {
    if (a.shoot_date && b.shoot_date) return b.shoot_date.localeCompare(a.shoot_date);
    if (a.shoot_date) return -1;
    if (b.shoot_date) return 1;
    return 0;
  });

  return (
    <div style={{ padding: '0 16px 24px' }}>
      <div className="chips">
        {STATUSES.map(s => (
          <button key={s} className={`chip ${filter === s ? 'active' : ''}`} onClick={() => setFilter(s)}>
            {s === 'all' ? t('shoots.all') : t(`shoots.statusLabels.${s}`)}
          </button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">—</div>
          <div className="empty-title">{t('shoots.empty')}</div>
        </div>
      ) : (
        <div className="card">
          {sorted.map(s => (
            <div key={s.id} className="shoot-item" style={{ cursor: 'pointer' }} onClick={() => setDetailShoot(s)}>
              <div className="shoot-item-top">
                <span className="shoot-item-name">{s.photographer_name}</span>
                <span className={`badge badge-${s.status}`}>{t(`shoots.statusLabels.${s.status}`)}</span>
              </div>
              <div className="shoot-item-meta">
                {s.shoot_date && <span>{new Date(s.shoot_date).toLocaleDateString()}</span>}
                {s.location && <span>{s.location}</span>}
                {s.rate && <span>{s.rate} {s.currency}</span>}
                {s.photographer_site && <span style={{ color: 'var(--text3)' }}>{s.photographer_site}</span>}
              </div>
              {s.notes && (
                <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>{s.notes}</div>
              )}
            </div>
          ))}
        </div>
      )}

      <ShootSheet
        shoot={detailShoot}
        onClose={() => setDetailShoot(null)}
        canEdit={canEdit}
        onShootUpdated={s => { onShootUpdated?.(s); setDetailShoot(null); }}
      />
    </div>
  );
}
