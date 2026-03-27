import React from 'react';
import { useLang } from '../i18n/useLang.js';
import Sheet from './Sheet.jsx';
import { api } from '../api.js';

const STATUSES = ['negotiating', 'confirmed', 'done', 'cancelled'];

export default function ShootSheet({ shoot, onClose, canEdit, onShootUpdated }) {
  const { t } = useLang();
  if (!shoot) return null;

  async function changeStatus(status) {
    const updated = await api.patch(`/api/shoots/${shoot.id}`, { status });
    onShootUpdated?.(updated);
    onClose();
  }

  return (
    <Sheet open={!!shoot} onClose={onClose} title={shoot.photographer_name || '—'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className={`badge badge-${shoot.status}`}>{t(`shoots.statusLabels.${shoot.status}`)}</span>
          {shoot.shoot_date && (
            <span style={{ fontSize: 14, color: 'var(--text2)' }}>
              {new Date(shoot.shoot_date).toLocaleDateString()}
            </span>
          )}
        </div>

        {shoot.location && (
          <div className="detail-row">
            <span style={{ color: 'var(--text3)', fontSize: 13 }}>Location</span>
            <span style={{ fontSize: 14 }}>{shoot.location}</span>
          </div>
        )}

        {shoot.rate && (
          <div className="detail-row">
            <span style={{ color: 'var(--text3)', fontSize: 13 }}>Rate</span>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{shoot.rate} {shoot.currency}</span>
          </div>
        )}

        {shoot.photographer_site && (
          <div className="detail-row">
            <span style={{ color: 'var(--text3)', fontSize: 13 }}>Site</span>
            <span style={{ fontSize: 14 }}>{shoot.photographer_site}</span>
          </div>
        )}

        {shoot.dialog_url && (
          <div className="detail-row">
            <span style={{ color: 'var(--text3)', fontSize: 13 }}>Dialog</span>
            <a href={shoot.dialog_url} target="_blank" rel="noreferrer" style={{ fontSize: 14, color: 'var(--accent)' }}>
              Open
            </a>
          </div>
        )}

        {shoot.notes && (
          <div style={{ fontSize: 13, color: 'var(--text2)', background: 'var(--bg3)', borderRadius: 10, padding: '10px 12px' }}>
            {shoot.notes}
          </div>
        )}

        {canEdit && (
          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>Change status</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {STATUSES.map(s => (
                <button
                  key={s}
                  onClick={() => changeStatus(s)}
                  style={{
                    padding: '6px 14px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13,
                    background: shoot.status === s ? 'var(--accent)' : 'var(--bg3)',
                    color: shoot.status === s ? '#fff' : 'var(--text2)',
                    fontWeight: shoot.status === s ? 600 : 400,
                  }}
                >
                  {t(`shoots.statusLabels.${s}`)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
