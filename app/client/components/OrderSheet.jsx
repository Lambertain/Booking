import React, { useState } from 'react';
import Sheet from './Sheet.jsx';
import { api } from '../api.js';
import { useLang } from '../i18n/useLang.js';
import ReminderConfig from './ReminderConfig.jsx';

const STATUSES = ['new', 'in_progress', 'done', 'cancelled'];
const ORDER_TYPES = ['rent', 'sale'];

const STATUS_COLORS = {
  new: 'var(--accent)',
  in_progress: 'var(--orange)',
  done: 'var(--green)',
  cancelled: 'var(--text3)',
};

const SITES = [
  { key: 'adultfolio', label: 'Adultfolio', hasIndex: false },
  { key: 'purpleport', label: 'PurplePort', hasIndex: false },
  { key: 'modelmayhem', label: 'ModelMayhem', hasIndex: false },
  { key: 'modelkartei', label: 'Model-Kartei', hasIndex: true },
];

function fmt(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtDatetime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function addDays(dateStr, days) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d;
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

function SiteStatsView({ stats, t }) {
  const [open, setOpen] = useState(null);
  if (!stats) return null;
  const hasAny = SITES.some(s => stats[s.key] && Object.keys(stats[s.key]).some(k => stats[s.key][k]));
  if (!hasAny) return null;

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {t('mailings.siteStats')}
      </div>
      {SITES.map(site => {
        const s = stats[site.key] || {};
        const hasData = Object.keys(s).some(k => s[k]);
        if (!hasData) return null;
        const isOpen = open === site.key;
        return (
          <div key={site.key} style={{ marginBottom: 4 }}>
            <button
              onClick={() => setOpen(isOpen ? null : site.key)}
              style={{ background: 'var(--bg3)', border: 'none', borderRadius: 8, padding: '6px 12px', width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>{site.label}</span>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                {s.count ? `${s.count} фото` : ''}{s.radius ? ` • ${s.radius}км` : ''} {isOpen ? '▲' : '▼'}
              </span>
            </button>
            {isOpen && (
              <div style={{ padding: '8px 12px', background: 'var(--bg2)', borderRadius: '0 0 8px 8px', fontSize: 13 }}>
                {s.launched_at && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><span style={{ color: 'var(--text3)' }}>{t('mailings.launchedAt')}</span><span>{fmtDatetime(s.launched_at)}</span></div>}
                {s.finished_at && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><span style={{ color: 'var(--text3)' }}>{t('mailings.finishedAt')}</span><span>{fmtDatetime(s.finished_at)}</span></div>}
                {s.radius && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><span style={{ color: 'var(--text3)' }}>{t('mailings.radius')}</span><span>{s.radius}</span></div>}
                {s.count && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><span style={{ color: 'var(--text3)' }}>{t('mailings.sentCount')}</span><span>{s.count}</span></div>}
                {site.hasIndex && s.index && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><span style={{ color: 'var(--text3)' }}>{t('mailings.siteIndex')}</span><span>{s.index}</span></div>}
                {s.db_updated_at && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><span style={{ color: 'var(--text3)' }}>{t('mailings.dbUpdatedAt')}</span><span>{fmtDatetime(s.db_updated_at)}</span></div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SiteStatsEdit({ value, onChange, t }) {
  const [open, setOpen] = useState(null);
  const stats = value || {};

  function setSite(siteKey, field, val) {
    const updated = { ...stats, [siteKey]: { ...(stats[siteKey] || {}), [field]: val } };
    onChange(updated);
  }

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {t('mailings.siteStats')}
      </div>
      {SITES.map(site => {
        const s = stats[site.key] || {};
        const isOpen = open === site.key;
        return (
          <div key={site.key} style={{ marginBottom: 6 }}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : site.key)}
              style={{ background: 'var(--bg3)', border: 'none', borderRadius: isOpen ? '8px 8px 0 0' : 8, padding: '8px 12px', width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>{site.label}</span>
              <span style={{ fontSize: 12, color: 'var(--accent)' }}>{isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && (
              <div style={{ padding: '10px 12px', background: 'var(--bg2)', borderRadius: '0 0 8px 8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div className="input-group" style={{ margin: 0 }}>
                  <div className="input-label">{t('mailings.launchedAt')}</div>
                  <input type="datetime-local" value={s.launched_at || ''} onChange={e => setSite(site.key, 'launched_at', e.target.value)} style={{ fontSize: 12 }} />
                </div>
                <div className="input-group" style={{ margin: 0 }}>
                  <div className="input-label">{t('mailings.finishedAt')}</div>
                  <input type="datetime-local" value={s.finished_at || ''} onChange={e => setSite(site.key, 'finished_at', e.target.value)} style={{ fontSize: 12 }} />
                </div>
                <div className="input-group" style={{ margin: 0 }}>
                  <div className="input-label">{t('mailings.radius')}</div>
                  <input type="number" value={s.radius || ''} onChange={e => setSite(site.key, 'radius', e.target.value)} style={{ fontSize: 12 }} placeholder="км" />
                </div>
                <div className="input-group" style={{ margin: 0 }}>
                  <div className="input-label">{t('mailings.sentCount')}</div>
                  <input type="number" value={s.count || ''} onChange={e => setSite(site.key, 'count', e.target.value)} style={{ fontSize: 12 }} />
                </div>
                {site.hasIndex && (
                  <div className="input-group" style={{ margin: 0 }}>
                    <div className="input-label">{t('mailings.siteIndex')}</div>
                    <input type="number" value={s.index || ''} onChange={e => setSite(site.key, 'index', e.target.value)} style={{ fontSize: 12 }} />
                  </div>
                )}
                <div className="input-group" style={{ margin: 0, gridColumn: site.hasIndex ? '2' : '1 / span 2' }}>
                  <div className="input-label">{t('mailings.dbUpdatedAt')}</div>
                  <input type="datetime-local" value={s.db_updated_at || ''} onChange={e => setSite(site.key, 'db_updated_at', e.target.value)} style={{ fontSize: 12 }} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function OrderSheet({ order, onClose, canEdit, onUpdated, allUsers, allSubscribers, msgTemplates, onTemplatesSaved }) {
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

  // Effective deadline: explicit or auto-calc from rental_end + 28 days
  const effDeadline = order.deadline
    ? new Date(order.deadline)
    : order.rental_end ? addDays(order.rental_end, 28) : null;
  const isAutoDeadline = !order.deadline && !!order.rental_end;

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
      contact_phone: order.contact_phone || '',
      model_sites: order.model_sites || '',
      responsible: order.responsible || '',
      price: order.price || '',
      deal_currency: order.deal_currency || '',
      payment: order.payment || '',
      deadline: order.deadline ? order.deadline.slice(0, 10) : '',
      notes: order.notes || '',
      deal_step: order.deal_step || '',
      site_stats: order.site_stats || {},
      reminder_config: order.reminder_config || {},
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
    } catch (err) {
      alert(err.message);
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
            <div className="input-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{t('mailings.deadline')}</span>
              {!form.deadline && form.rental_end && (
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                  {t('mailings.deadlineAuto')}: {fmt(addDays(form.rental_end, 28))}
                </span>
              )}
            </div>
            <input type="date" value={form.deadline} onChange={e => set('deadline', e.target.value)} placeholder={t('mailings.deadlineAuto')} />
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
            <div className="input-label">{t('mailings.contactPhone')}</div>
            <input type="tel" value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} placeholder="+38..." />
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
              <div style={{ display: 'flex', gap: 4 }}>
                <input type="number" value={form.price} onChange={e => set('price', e.target.value)} style={{ flex: 1 }} />
                <input value={form.deal_currency} onChange={e => set('deal_currency', e.target.value)} placeholder="EUR" style={{ width: 52 }} />
              </div>
            </div>
          </div>

          <div className="input-group">
            <div className="input-label">{t('mailings.payment')}</div>
            <input value={form.payment} onChange={e => set('payment', e.target.value)} placeholder="оплачено / не оплачено..." />
          </div>

          <div className="input-group">
            <div className="input-label">{t('mailings.notes')}</div>
            <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} style={{ resize: 'vertical' }} />
          </div>

          <SiteStatsEdit value={form.site_stats} onChange={v => set('site_stats', v)} t={t} />

          <div style={{ height: 1, background: 'var(--separator)', margin: '16px 0' }} />

          <ReminderConfig
            value={form.reminder_config}
            onChange={v => set('reminder_config', v)}
            allSubscribers={allSubscribers}
            msgTemplates={msgTemplates}
            onTemplatesSaved={onTemplatesSaved}
          />

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
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
            {effDeadline && (() => {
              const daysLeft = Math.ceil((effDeadline - new Date()) / 86400000);
              const urgent = daysLeft <= 2;
              return (
                <span style={{ background: urgent ? 'var(--red, #ff3b30)' : 'var(--bg3)', color: urgent ? '#fff' : 'var(--text2)', borderRadius: 8, padding: '3px 10px', fontSize: 12 }}>
                  ⏰ {fmt(effDeadline)}{isAutoDeadline ? ` (${t('mailings.deadlineAuto')})` : ''}
                </span>
              );
            })()}
          </div>

          <Row label={t('mailings.client')} value={order.client_name} />
          <Row label={t('mailings.botContact')} value={order.subscriber_name && `${order.subscriber_name}${order.subscriber_username ? ` @${order.subscriber_username}` : ''}`} />
          <Row label={t('mailings.contact')} value={!order.subscriber_name && order.contact_name} />
          <Row label={t('mailings.contactEmail')} value={order.contact_email} />
          <Row label={t('mailings.contactPhone')} value={order.contact_phone} />
          <Row label={t('mailings.tour1')} value={order.rental_start && `${fmt(order.rental_start)} — ${fmt(order.rental_end)}`} />
          <Row label={t('mailings.tour2')} value={order.tour_start_2 && `${fmt(order.tour_start_2)} — ${fmt(order.tour_end_2)}`} />
          <Row label={t('mailings.deadline')} value={effDeadline && `${fmt(effDeadline)}${isAutoDeadline ? ` (${t('mailings.deadlineAuto')})` : ''}`} />
          <Row label={t('mailings.modelSites')} value={order.model_sites} />
          <Row label={t('mailings.responsible')} value={order.responsible} />
          <Row label={t('mailings.price')} value={order.price > 0 && `${order.price} ${order.deal_currency || 'EUR'}`} />
          <Row label={t('mailings.payment')} value={order.payment} />
          <Row label={t('mailings.notes')} value={order.notes} />
          <Row label={t('mailings.created')} value={fmt(order.created_at)} />
          <Row label={t('mailings.dealId')} value={order.deal_id} />

          <SiteStatsView stats={order.site_stats} t={t} />

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
