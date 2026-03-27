import React, { useState } from 'react';
import { useLang } from '../i18n/useLang.js';
import Sheet from './Sheet.jsx';
import { api } from '../api.js';

const STATUSES = ['negotiating', 'confirmed', 'done', 'cancelled'];

export default function ShootSheet({ shoot, onClose, canEdit, onShootUpdated }) {
  const { t } = useLang();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  if (!shoot) return null;

  function openEdit() {
    setForm({
      photographer_name: shoot.photographer_name || '',
      photographer_site: shoot.photographer_site || '',
      photographer_email: shoot.photographer_email || '',
      photographer_phone: shoot.photographer_phone || '',
      photographer_telegram: shoot.photographer_telegram || '',
      dialog_url: shoot.dialog_url || '',
      shoot_date: shoot.shoot_date ? shoot.shoot_date.slice(0, 10) : '',
      location: shoot.location || '',
      rate: shoot.rate || '',
      currency: shoot.currency || 'EUR',
      status: shoot.status,
      notes: shoot.notes || '',
    });
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await api.patch(`/api/shoots/${shoot.id}`, form);
      onShootUpdated?.(updated);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(status) {
    const updated = await api.patch(`/api/shoots/${shoot.id}`, { status });
    onShootUpdated?.(updated);
    onClose();
  }

  function handleClose() {
    setEditing(false);
    onClose();
  }

  const tgHandle = shoot.photographer_telegram?.replace(/^@/, '');

  return (
    <Sheet open={!!shoot} onClose={handleClose} title={editing ? 'Редактировать съёмку' : (shoot.photographer_name || '—')}>
      {editing && form ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, overflowY: 'auto', maxHeight: '65vh' }}>
          <div className="list-section-title" style={{ marginBottom: 6 }}>Фотограф</div>
          {[
            { key: 'photographer_name',     label: 'Имя',      ph: 'Имя фотографа' },
            { key: 'photographer_site',     label: 'Сайт',     ph: 'purpleport / modelmayhem' },
            { key: 'photographer_email',    label: 'Email',    ph: 'email@example.com', type: 'email' },
            { key: 'photographer_phone',    label: 'Телефон',  ph: '+49 ...',            type: 'tel' },
            { key: 'photographer_telegram', label: 'Telegram', ph: '@username' },
            { key: 'dialog_url',            label: 'Диалог',   ph: 'https://...' },
          ].map(f => (
            <div className="input-group" key={f.key}>
              <div className="input-label">{f.label}</div>
              <input
                type={f.type || 'text'}
                value={form[f.key]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.ph}
              />
            </div>
          ))}

          <div className="list-section-title" style={{ margin: '12px 0 6px' }}>Съёмка</div>
          <div className="input-group">
            <div className="input-label">Дата</div>
            <input type="date" value={form.shoot_date} onChange={e => setForm(p => ({ ...p, shoot_date: e.target.value }))} />
          </div>
          <div className="input-group">
            <div className="input-label">Локация</div>
            <input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="Город, место" />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="input-group" style={{ flex: 1 }}>
              <div className="input-label">Ставка</div>
              <input type="number" value={form.rate} onChange={e => setForm(p => ({ ...p, rate: e.target.value }))} placeholder="0" />
            </div>
            <div className="input-group" style={{ width: 80 }}>
              <div className="input-label">Валюта</div>
              <select value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))}>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
                <option value="PLN">PLN</option>
              </select>
            </div>
          </div>
          <div className="input-group">
            <div className="input-label">Статус</div>
            <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
              {STATUSES.map(s => <option key={s} value={s}>{t(`shoots.statusLabels.${s}`)}</option>)}
            </select>
          </div>
          <div className="input-group">
            <div className="input-label">Заметки</div>
            <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} placeholder="Условия, детали..." />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setEditing(false)}>Отмена</button>
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={save} disabled={saving}>
              {saving ? '...' : t('save')}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* Status + Date */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span className={`badge badge-${shoot.status}`}>{t(`shoots.statusLabels.${shoot.status}`)}</span>
            {shoot.shoot_date && (
              <span style={{ fontSize: 14, color: 'var(--text2)' }}>
                {new Date(shoot.shoot_date).toLocaleDateString()}
              </span>
            )}
          </div>

          {/* Shoot info */}
          {[
            shoot.location && { label: 'Локация', value: shoot.location },
            shoot.rate     && { label: 'Ставка',  value: `${shoot.rate} ${shoot.currency}`, bold: true },
            shoot.photographer_site && { label: 'Площадка', value: shoot.photographer_site },
          ].filter(Boolean).map(row => (
            <div key={row.label} className="detail-row">
              <span style={{ color: 'var(--text3)', fontSize: 13 }}>{row.label}</span>
              <span style={{ fontSize: 14, fontWeight: row.bold ? 600 : 400 }}>{row.value}</span>
            </div>
          ))}

          {/* Photographer contacts */}
          {(shoot.photographer_email || shoot.photographer_phone || shoot.photographer_telegram || shoot.dialog_url) && (
            <>
              <div className="list-section-title" style={{ margin: '12px 0 4px' }}>Контакты фотографа</div>
              {shoot.photographer_email && (
                <div className="detail-row">
                  <span style={{ color: 'var(--text3)', fontSize: 13 }}>Email</span>
                  <a href={`mailto:${shoot.photographer_email}`} style={{ fontSize: 14, color: 'var(--accent)' }}>
                    {shoot.photographer_email}
                  </a>
                </div>
              )}
              {shoot.photographer_phone && (
                <div className="detail-row">
                  <span style={{ color: 'var(--text3)', fontSize: 13 }}>Телефон</span>
                  <a href={`tel:${shoot.photographer_phone}`} style={{ fontSize: 14, color: 'var(--accent)' }}>
                    {shoot.photographer_phone}
                  </a>
                </div>
              )}
              {shoot.photographer_telegram && (
                <div className="detail-row">
                  <span style={{ color: 'var(--text3)', fontSize: 13 }}>Telegram</span>
                  <a href={`https://t.me/${tgHandle}`} target="_blank" rel="noreferrer" style={{ fontSize: 14, color: 'var(--accent)' }}>
                    @{tgHandle}
                  </a>
                </div>
              )}
              {shoot.dialog_url && (
                <div className="detail-row">
                  <span style={{ color: 'var(--text3)', fontSize: 13 }}>Диалог</span>
                  <a href={shoot.dialog_url} target="_blank" rel="noreferrer" style={{ fontSize: 14, color: 'var(--accent)' }}>
                    Открыть
                  </a>
                </div>
              )}
            </>
          )}

          {shoot.notes && (
            <div style={{ fontSize: 13, color: 'var(--text2)', background: 'var(--bg3)', borderRadius: 10, padding: '10px 12px', marginTop: 12 }}>
              {shoot.notes}
            </div>
          )}

          {/* Actions */}
          {canEdit && (
            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={openEdit}>
                Редактировать
              </button>
            </div>
          )}

          {canEdit && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>Сменить статус</div>
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
      )}
    </Sheet>
  );
}
