import React, { useState } from 'react';
import Sheet from './Sheet.jsx';
import { api } from '../api.js';

const STATUSES = ['new', 'in_progress', 'done', 'cancelled'];
const ORDER_TYPES = ['rent', 'sale'];

const STATUS_COLORS = {
  new: 'var(--accent)',
  in_progress: 'var(--orange)',
  done: 'var(--green)',
  cancelled: 'var(--text3)',
};

const STATUS_LABELS = { new: 'Новий', in_progress: 'В роботі', done: 'Виконано', cancelled: 'Скасовано' };
const TYPE_LABELS = { rent: 'Оренда', sale: 'Продаж' };

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
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  if (!order) return null;

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
      linked: '',  // "user_123" or "sub_456"
    });
    setEditing(true);
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function save() {
    setSaving(true);
    try {
      const payload = { ...form };
      delete payload.linked;
      // parse linked value into user_id or subscriber_id
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
    <Sheet open={!!order} onClose={handleClose} title={editing ? '✏️ Редагування' : title}>
      {editing && form ? (
        <div>
          <div className="input-group">
            <div className="input-label">Назва</div>
            <input value={form.template_name} onChange={e => set('template_name', e.target.value)} placeholder="Назва рассилки" />
          </div>

          <div className="input-group">
            <div className="input-label">Прив'язати до контакту</div>
            <select value={form.linked} onChange={e => {
              const val = e.target.value;
              set('linked', val);
              if (val.startsWith('user_')) {
                const uid = val.slice(5);
                const u = (allUsers || []).find(x => String(x.id) === uid);
                if (u) set('contact_name', u.name);
              } else if (val.startsWith('sub_')) {
                const sid = val.slice(4);
                const s = (allSubscribers || []).find(x => String(x.id) === sid);
                if (s) { set('contact_name', s.full_name || s.username || ''); }
              }
            }}>
              <option value="">— Оберіть контакт —</option>
              {(allUsers || []).length > 0 && (
                <optgroup label="Системні юзери">
                  {(allUsers || []).map(u => (
                    <option key={`user_${u.id}`} value={`user_${u.id}`}>{u.name} ({u.role})</option>
                  ))}
                </optgroup>
              )}
              {(allSubscribers || []).length > 0 && (
                <optgroup label="Контакти (бот)">
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
            <div className="input-label">Статус</div>
            <select value={form.status} onChange={e => set('status', e.target.value)}>
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>

          <div className="input-group">
            <div className="input-label">Тип</div>
            <select value={form.order_type} onChange={e => set('order_type', e.target.value)}>
              {ORDER_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="input-group">
              <div className="input-label">Тур 1 — від</div>
              <input type="date" value={form.rental_start} onChange={e => set('rental_start', e.target.value)} />
            </div>
            <div className="input-group">
              <div className="input-label">до</div>
              <input type="date" value={form.rental_end} onChange={e => set('rental_end', e.target.value)} />
            </div>
            <div className="input-group">
              <div className="input-label">Тур 2 — від</div>
              <input type="date" value={form.tour_start_2} onChange={e => set('tour_start_2', e.target.value)} />
            </div>
            <div className="input-group">
              <div className="input-label">до</div>
              <input type="date" value={form.tour_end_2} onChange={e => set('tour_end_2', e.target.value)} />
            </div>
          </div>

          <div className="input-group">
            <div className="input-label">Контакт</div>
            <input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} placeholder="Ім'я контакту" />
          </div>
          <div className="input-group">
            <div className="input-label">Email контакту</div>
            <input type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} placeholder="email@example.com" />
          </div>
          <div className="input-group">
            <div className="input-label">Сайти моделі</div>
            <input value={form.model_sites} onChange={e => set('model_sites', e.target.value)} placeholder="MM, MK..." />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="input-group">
              <div className="input-label">Відповідальний</div>
              <input value={form.responsible} onChange={e => set('responsible', e.target.value)} />
            </div>
            <div className="input-group">
              <div className="input-label">Ціна (EUR)</div>
              <input type="number" value={form.price} onChange={e => set('price', e.target.value)} />
            </div>
          </div>
          <div className="input-group">
            <div className="input-label">Нотатки</div>
            <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} style={{ resize: 'vertical' }} />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-full" onClick={() => setEditing(false)}>Скасувати</button>
            <button className="btn btn-primary btn-full" onClick={save} disabled={saving}>
              {saving ? 'Збереження...' : 'Зберегти'}
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
                CRM: {order.deal_step}
              </span>
            )}
            {order.order_type && (
              <span style={{ background: 'var(--bg3)', color: 'var(--text2)', borderRadius: 8, padding: '3px 10px', fontSize: 12 }}>
                {TYPE_LABELS[order.order_type] || order.order_type}
              </span>
            )}
          </div>

          <Row label="Клієнт" value={order.client_name} />
          <Row label="Контакт (бот)" value={order.subscriber_name && `${order.subscriber_name}${order.subscriber_username ? ` @${order.subscriber_username}` : ''}`} />
          <Row label="Контакт" value={!order.subscriber_name && order.contact_name} />
          <Row label="Email" value={order.contact_email} />
          <Row label="Тур 1" value={order.rental_start && `${fmt(order.rental_start)} — ${fmt(order.rental_end)}`} />
          <Row label="Тур 2" value={order.tour_start_2 && `${fmt(order.tour_start_2)} — ${fmt(order.tour_end_2)}`} />
          <Row label="Сайти моделі" value={order.model_sites} />
          <Row label="Відповідальний" value={order.responsible} />
          <Row label="Ціна" value={order.price > 0 && `${order.price} EUR`} />
          <Row label="Нотатки" value={order.notes} />
          <Row label="Створено" value={fmt(order.created_at)} />
          <Row label="Deal ID" value={order.deal_id} />

          {canEdit && (
            <button className="btn btn-primary btn-full" style={{ marginTop: 16 }} onClick={openEdit}>
              ✏️ Редагувати
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}
