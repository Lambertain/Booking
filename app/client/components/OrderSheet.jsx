import React, { useState } from 'react';
import Sheet from './Sheet.jsx';
import { api } from '../api.js';
import { useLang } from '../i18n/useLang.js';

const STATUSES = ['new', 'in_progress', 'done', 'cancelled'];
const ORDER_TYPES = ['rent', 'sale'];

const STATUS_COLORS = {
  new: 'var(--accent)',
  in_progress: 'var(--orange)',
  done: 'var(--green)',
  cancelled: 'var(--text3)',
};

function fmt(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--separator)' }}>
      <span style={{ color: 'var(--text3)', fontSize: 13, minWidth: 110 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text)', flex: 1, wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

export default function OrderSheet({ order, onClose, canEdit, onUpdated, allUsers, allSubscribers }) {
  const { t } = useLang();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  if (!order) return null;

  const STATUS_LABELS = {
    new: t('mailings.statusLabels.new'),
    in_progress: t('mailings.statusLabels.in_progress'),
    done: t('mailings.statusLabels.done'),
    cancelled: t('mailings.statusLabels.cancelled'),
  };
  const TYPE_LABELS = {
    rent: t('mailings.orderTypeLabels.rent'),
    sale: t('mailings.orderTypeLabels.sale'),
  };

  function openEdit() {
    setForm({
      template_name: order.template_name || '',
      status: order.status || 'new',
      order_type: order.order_type || 'rent',
      rental_start: order.rental_start ? order.rental_start.slice(0, 10) : '',
      rental_end: order.rental_end ? order.rental_end.slice(0, 10) : '',
      tour_start_2: order.tour_start_2 ? order.tour_start_2.slice(0, 10) : '',
      tour_end_2: order.tour_end_2 ? order.tour_end_2.slice(0, 10) : '',
      contact_name: order.contact_name || '',
      contact_email: order.contact_email || '',
      model_sites: order.model_sites || '',
      responsible: order.responsible || '',
      price: order.price || '',
      notes: order.notes || '',
      deal_step: order.deal_step || '',
      linked: '',
    });
    setEditing(true);
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function save() {
    setSaving(true);
    try {
      const payload = { ...form };
      delete payload.linked;
      if (form.linked?.startsWith('user_')) payload.user_id = parseInt(form.linked.slice(5));
      else if (form.linked?.startsWith('sub_')) payload.subscriber_id = parseInt(form.linked.slice(4));
      const updated = await api.patch(`/api/orders/${order.id}`, payload);
      onUpdated?.(updated);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    setEditing(false);
    onClose();
  }

  const title = order.template_name || order.client_name || `#${order.id}`;
  const statusColor = STATUS_COLORS[order.status] || 'var(--text3)';

  return (
    <Sheet open={!!order} onClose={handleClose} title={editing ? t('editing') : title}>
      {editing && form ? (
        <div>
          <div className="input-group">
            <div className="input-label">{t('mailings.name')}</div>
            <input value={form.template_name} onChange={e => set('template_name', e.target.value)} placeholder={t('mailings.name')} />
          </div>

          <div className="input-group">
            <div className="input-label">{t('mailings.linkContact')}</div>
            <select value={form.linked} onChange={e => {
              const val = e.target.value;
              set('linked', val);
              if (val.startsWith('user_')) {
                const u = (allUsers || []).find(x => String(x.id) === val.slice(5));
                if (u) set('contact_name', u.name);
              } else if (val.startsWith('sub_')) {
                const s = (allSubscribers || []).find(x => String(x.id) === val.slice(4));
                if (s) set('contact_name', s.full_name || s.username || '');
              }
            }}>
              <option value="">{t('mailings.selectContact')}</option>
              {(allUsers || []).length > 0 && (
                <optgroup label={t('mailings.systemUsers')}>
                  {(allUsers || []).map(u => (
                    <option key={`user_${u.id}`} value={`user_${u.id}`}>{u.name} ({u.role})</option>
                  ))}
                </optgroup>
              )}
              {(allSubscribers || []).length > 0 && (
                <optgroup label={t('mailings.botContacts')}>
                  {(allSubscribers || []).map(s => (
                    <option key={`sub_${s.id}`} value={`sub_${s.id}`}>
                      {s.full_name || s.username || `tg:${s.telegram_id}`}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          <div className="input-group">
            <div className="input-label">{t('users.status')}</div>
            <select value={form.status} onChange={e => set('status', e.target.value)}>
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>

          <div className="input-group">
            <div className="input-label">{t('mailings.orderType')}</div>
            <select value={form.order_type} onChange={e => set('order_type', e.target.value)}>
              {ORDER_TYPES.map(tp => <option key={tp} value={tp}>{TYPE_LABELS[tp]}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="input-group">
              <div className="input-label">{t('mailings.tour1from')}</div>
              <input type="date" value={form.rental_start} onChange={e => set('rental_start', e.target.value)} />
            </div>
            <div className="input-group">
              <div className="input-label">{t('to')}</div>
              <input type="date" value={form.rental_end} onChange={e => set('rental_end', e.target.value)} />
            </div>
            <div className="input-group">
              <div className="input-label">{t('mailings.tour2from')}</div>
              <input type="date" value={form.tour_start_2} onChange={e => set('tour_start_2', e.target.value)} />
            </div>
            <div className="input-group">
              <div className="input-label">{t('to')}</div>
              <input type="date" value={form.tour_end_2} onChange={e => set('tour_end_2', e.target.value)} />
            </div>
          </div>

          <div className="input-group">
            <div className="input-label">{t('mailings.contactName')}</div>
            <input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} />
          </div>
          <div className="input-group">
            <div className="input-label">{t('mailings.contactEmail')}</div>
            <input type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} placeholder="email@example.com" />
          </div>
          <div className="input-group">
            <div className="input-label">{t('mailings.modelSites')}</div>
            <input value={form.model_sites} onChange={e => set('model_sites', e.target.value)} placeholder="MM, MK..." />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="input-group">
              <div className="input-label">{t('mailings.responsible')}</div>
              <input value={form.responsible} onChange={e => set('responsible', e.target.value)} />
            </div>
            <div className="input-group">
              <div className="input-label">{t('mailings.price')}</div>
              <input type="number" value={form.price} onChange={e => set('price', e.target.value)} />
            </div>
          </div>
          <div className="input-group">
            <div className="input-label">{t('mailings.notes')}</div>
            <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} style={{ resize: 'vertical' }} />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-full" onClick={() => setEditing(false)}>{t('cancel')}</button>
            <button className="btn btn-primary btn-full" onClick={save} disabled={saving}>
              {saving ? t('saving') : t('save')}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ background: statusColor, color: '#fff', borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
              {STATUS_LABELS[order.status] || order.status}
            </span>
            {order.deal_step && (
              <span style={{ background: 'var(--bg3)', color: 'var(--text2)', borderRadius: 8, padding: '3px 10px', fontSize: 12 }}>
                {t('mailings.dealStep')}: {order.deal_step}
              </span>
            )}
            {order.order_type && (
              <span style={{ background: 'var(--bg3)', color: 'var(--text2)', borderRadius: 8, padding: '3px 10px', fontSize: 12 }}>
                {TYPE_LABELS[order.order_type] || order.order_type}
              </span>
            )}
          </div>

          <Row label={t('mailings.client')} value={order.client_name} />
          <Row label={t('mailings.botContact')} value={order.subscriber_name && `${order.subscriber_name}${order.subscriber_username ? ` @${order.subscriber_username}` : ''}`} />
          <Row label={t('mailings.contact')} value={!order.subscriber_name && order.contact_name} />
          <Row label={t('mailings.contactEmail')} value={order.contact_email} />
          <Row label={t('mailings.tour1')} value={order.rental_start && `${fmt(order.rental_start)} — ${fmt(order.rental_end)}`} />
          <Row label={t('mailings.tour2')} value={order.tour_start_2 && `${fmt(order.tour_start_2)} — ${fmt(order.tour_end_2)}`} />
          <Row label={t('mailings.modelSites')} value={order.model_sites} />
          <Row label={t('mailings.responsible')} value={order.responsible} />
          <Row label={t('mailings.price')} value={order.price > 0 && `${order.price} EUR`} />
          <Row label={t('mailings.notes')} value={order.notes} />
          <Row label={t('mailings.created')} value={fmt(order.created_at)} />
          <Row label={t('mailings.dealId')} value={order.deal_id} />

          {canEdit && (
            <button className="btn btn-primary btn-full" style={{ marginTop: 16 }} onClick={openEdit}>
              {t('editing')}
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}
