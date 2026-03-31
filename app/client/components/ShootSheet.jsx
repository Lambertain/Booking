import React, { useState } from 'react';
import { useLang } from '../i18n/useLang.js';
import Sheet from './Sheet.jsx';
import { api } from '../api.js';

const STATUSES = ['negotiating', 'reserve', 'day_scheduled', 'confirmed', 'done', 'cancelled', 'cancelled_photographer', 'cancelled_model', 'cancelled_agency'];

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
      photographer_profile_url: shoot.photographer_profile_url || '',
      dialog_url: shoot.dialog_url || '',
      shoot_date: shoot.shoot_date ? shoot.shoot_date.slice(0, 10) : '',
      shoot_time: shoot.shoot_time ? shoot.shoot_time.slice(0, 5) : '',
      duration_hours: shoot.duration_hours || '',
      city: shoot.city || '',
      location: shoot.location || '',
      shoot_style: shoot.shoot_style || '',
      rate: shoot.rate || '',
      currency: shoot.currency || 'EUR',
      expenses: shoot.expenses || '',
      source_site: shoot.source_site || '',
      status: shoot.status,
      notes: shoot.notes || '',
      service_amount: shoot.service_amount || '',
      service_currency: shoot.service_currency || '',
      service_status: shoot.service_status || '',
      payment_method: shoot.payment_method || '',
    });
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await api.patch(`/api/shoots/${shoot.id}`, form);
      onShootUpdated?.(updated);
      setEditing(false);
    } catch (err) {
      alert(err.message);
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
    <Sheet open={!!shoot} onClose={handleClose} title={editing ? t('editing') : (shoot.photographer_name || '—')}>
      {editing && form ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, overflowY: 'auto', maxHeight: '65vh' }}>
          <div className="list-section-title" style={{ marginBottom: 6 }}>{t('shoots.photographer')}</div>
          {[
            { key: 'photographer_name',     label: t('shoots.name'),    ph: t('shoots.photographer') },
            { key: 'photographer_site',     label: t('shoots.site'),    ph: 'purpleport / modelmayhem' },
            { key: 'photographer_email',    label: 'Email',             ph: 'email@example.com', type: 'email' },
            { key: 'photographer_phone',    label: t('shoots.phone'),   ph: '+49 ...', type: 'tel' },
            { key: 'photographer_telegram',    label: 'Telegram',               ph: '@username' },
            { key: 'photographer_profile_url', label: t('shoots.profileUrl'),   ph: 'https://purpleport.com/...' },
            { key: 'dialog_url',               label: t('shoots.dialog'),       ph: 'https://...' },
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

          <div className="list-section-title" style={{ margin: '12px 0 6px' }}>{t('shoots.title')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="input-group">
              <div className="input-label">{t('shoots.date')}</div>
              <input type="date" value={form.shoot_date} onChange={e => setForm(p => ({ ...p, shoot_date: e.target.value }))} />
            </div>
            <div className="input-group">
              <div className="input-label">{t('shoots.startTime')}</div>
              <input type="time" value={form.shoot_time} onChange={e => setForm(p => ({ ...p, shoot_time: e.target.value }))} />
            </div>
          </div>
          <div className="input-group">
            <div className="input-label">{t('shoots.duration')}</div>
            <input type="number" min="0.5" step="0.5" value={form.duration_hours} onChange={e => setForm(p => ({ ...p, duration_hours: e.target.value }))} placeholder="2" />
          </div>
          <div className="input-group">
            <div className="input-label">{t('shoots.city')}</div>
            <input value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} />
          </div>
          <div className="input-group">
            <div className="input-label">{t('shoots.location')}</div>
            <input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} />
          </div>
          <div className="input-group">
            <div className="input-label">{t('shoots.shootStyle')}</div>
            <textarea value={form.shoot_style} onChange={e => setForm(p => ({ ...p, shoot_style: e.target.value }))} rows={2} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="input-group" style={{ flex: 1 }}>
              <div className="input-label">{t('shoots.rate')}</div>
              <input type="number" value={form.rate} onChange={e => setForm(p => ({ ...p, rate: e.target.value }))} placeholder="0" />
            </div>
            <div className="input-group" style={{ width: 80 }}>
              <div className="input-label">{t('shoots.currency')}</div>
              <select value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))}>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
                <option value="PLN">PLN</option>
              </select>
            </div>
          </div>
          <div className="input-group">
            <div className="input-label">{t('shoots.expenses')}</div>
            <input type="number" step="0.01" value={form.expenses} onChange={e => setForm(p => ({ ...p, expenses: e.target.value }))} placeholder="0" />
          </div>
          <div className="input-group">
            <div className="input-label">{t('shoots.sourceSite')}</div>
            <input value={form.source_site} onChange={e => setForm(p => ({ ...p, source_site: e.target.value }))} />
          </div>
          <div className="input-group">
            <div className="input-label">{t('shoots.status')}</div>
            <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
              {STATUSES.map(s => <option key={s} value={s}>{t(`shoots.statusLabels.${s}`)}</option>)}
            </select>
          </div>
          <div className="input-group">
            <div className="input-label">{t('shoots.notes')}</div>
            <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} />
          </div>
          <div className="list-section-title" style={{ margin: '12px 0 6px' }}>{t('shoots.serviceSection')}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="input-group" style={{ flex: 1 }}>
              <div className="input-label">{t('shoots.serviceAmount')}</div>
              <input type="number" step="0.01" value={form.service_amount} onChange={e => setForm(p => ({ ...p, service_amount: e.target.value }))} placeholder="0" />
            </div>
            <div className="input-group" style={{ width: 80 }}>
              <div className="input-label">{t('shoots.currency')}</div>
              <select value={form.service_currency} onChange={e => setForm(p => ({ ...p, service_currency: e.target.value }))}>
                <option value="">—</option>
                <option value="€">EUR</option>
                <option value="$">USD</option>
                <option value="PLN">PLN</option>
              </select>
            </div>
          </div>
          <div className="input-group">
            <div className="input-label">{t('shoots.paymentMethod')}</div>
            <input value={form.payment_method} onChange={e => setForm(p => ({ ...p, payment_method: e.target.value }))} placeholder="Revolut / PayPal / Mono" />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setEditing(false)}>{t('cancel')}</button>
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={save} disabled={saving}>
              {saving ? t('saving') : t('save')}
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
            shoot.city         && { label: t('shoots.city'),      value: shoot.city },
            shoot.location     && { label: t('shoots.location'),  value: shoot.location },
            shoot.shoot_time   && { label: t('shoots.startTime'), value: shoot.shoot_time.slice(0, 5) },
            shoot.duration_hours && { label: t('shoots.duration'), value: `${shoot.duration_hours} ${t('shoots.hours')}` },
            shoot.rate         && { label: t('shoots.rate'),      value: `${shoot.rate} ${shoot.currency}`, bold: true },
            shoot.expenses     && { label: t('shoots.expenses'),  value: `${shoot.expenses} €` },
            shoot.source_site  && { label: t('shoots.sourceSite'), value: shoot.source_site },
            shoot.photographer_site && { label: t('shoots.venue'), value: shoot.photographer_site },
          ].filter(Boolean).map(row => (
            <div key={row.label} className="detail-row">
              <span style={{ color: 'var(--text3)', fontSize: 13 }}>{row.label}</span>
              <span style={{ fontSize: 14, fontWeight: row.bold ? 600 : 400 }}>{row.value}</span>
            </div>
          ))}

          {shoot.shoot_style && (
            <div style={{ fontSize: 13, color: 'var(--text2)', background: 'var(--bg3)', borderRadius: 10, padding: '8px 12px', marginTop: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 2 }}>{t('shoots.shootStyle')}</span>
              {shoot.shoot_style}
            </div>
          )}

          {(shoot.service_amount || shoot.payment_method) && (
            <>
              <div className="list-section-title" style={{ margin: '12px 0 4px' }}>{t('shoots.serviceSection')}</div>
              {shoot.service_amount && (
                <div className="detail-row">
                  <span style={{ color: 'var(--text3)', fontSize: 13 }}>{t('shoots.serviceAmount')}</span>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{shoot.service_amount} {shoot.service_currency || ''}</span>
                </div>
              )}
              {shoot.payment_method && (
                <div className="detail-row">
                  <span style={{ color: 'var(--text3)', fontSize: 13 }}>{t('shoots.paymentMethod')}</span>
                  <span style={{ fontSize: 14 }}>{shoot.payment_method}</span>
                </div>
              )}
              {shoot.service_status && (
                <div className="detail-row">
                  <span style={{ color: 'var(--text3)', fontSize: 13 }}>{t('shoots.serviceStatus')}</span>
                  <span style={{ fontSize: 14 }}>{shoot.service_status}</span>
                </div>
              )}
            </>
          )}

          {/* Photographer contacts */}
          {(shoot.photographer_email || shoot.photographer_phone || shoot.photographer_telegram || shoot.photographer_profile_url || shoot.dialog_url) && (
            <>
              <div className="list-section-title" style={{ margin: '12px 0 4px' }}>{t('shoots.photographerContacts')}</div>
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
                  <span style={{ color: 'var(--text3)', fontSize: 13 }}>{t('shoots.phone')}</span>
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
              {shoot.photographer_profile_url && (
                <div className="detail-row">
                  <span style={{ color: 'var(--text3)', fontSize: 13 }}>{t('shoots.profileUrl')}</span>
                  <a href={shoot.photographer_profile_url} target="_blank" rel="noreferrer" style={{ fontSize: 14, color: 'var(--accent)' }}>
                    {t('shoots.open')}
                  </a>
                </div>
              )}
              {shoot.dialog_url && (
                <div className="detail-row">
                  <span style={{ color: 'var(--text3)', fontSize: 13 }}>{t('shoots.dialog')}</span>
                  <a href={shoot.dialog_url} target="_blank" rel="noreferrer" style={{ fontSize: 14, color: 'var(--accent)' }}>
                    {t('shoots.open')}
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
                {t('edit')}
              </button>
            </div>
          )}

          {canEdit && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>{t('shoots.changeStatus')}</div>
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
