import React, { useState } from 'react';
import Sheet from './Sheet.jsx';
import { api } from '../api.js';
import { useLang } from '../i18n/useLang.js';
import ReminderConfig from './ReminderConfig.jsx';

const STEP_COLORS = {
  'В работе': 'var(--accent)',
  'Удалить': 'var(--red)',
  'Готово': 'var(--green)',
};

const STEP_LABEL_KEY = { 'В работе': 'inWork', 'Готово': 'done', 'Удалить': 'delete' };

function fmt(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
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

export default function TemplateSheet({ template, onClose, canEdit, onUpdated, allUsers, allSubscribers, msgTemplates, onTemplatesSaved }) {
  const { t } = useLang();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  if (!template) return null;

  function getStepLabel(s) {
    const key = STEP_LABEL_KEY[s];
    return key ? t('templates.stepLabels.' + key) : s;
  }

  const TYPE_LABELS = {
    rent: t('mailings.orderTypeLabels.rent'),
    sale: t('mailings.orderTypeLabels.sale'),
  };

  // Effective deadline: explicit or auto-calc from rental_end + 28 days
  const effDeadline = template.deadline
    ? new Date(template.deadline)
    : template.rental_end ? addDays(template.rental_end, 28) : null;
  const isAutoDeadline = !template.deadline && !!template.rental_end;

  function openEdit() {
    setForm({
      name: template.name || '',
      deal_step: template.deal_step || '',
      price: template.price || '',
      rental_start: template.rental_start ? template.rental_start.slice(0, 10) : '',
      rental_end: template.rental_end ? template.rental_end.slice(0, 10) : '',
      deadline: template.deadline ? template.deadline.slice(0, 10) : '',
      model_sites: template.model_sites || '',
      accesses: template.accesses || '',
      accounts: template.accounts || '',
      contact_name: template.contact_name || '',
      contact_email: template.contact_email || '',
      deal_type: template.deal_type || 'rent',
      responsible: template.responsible || '',
      reminder_config: template.reminder_config || {},
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
      if (form.linked?.startsWith('sub_')) payload.subscriber_id = parseInt(form.linked.slice(4));
      if (!payload.created_by) delete payload.created_by;
      const updated = await api.patch(`/api/templates/${template.id}`, payload);
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

  const stepColor = STEP_COLORS[template.deal_step] || 'var(--text3)';

  return (
    <Sheet open={!!template} onClose={handleClose} title={editing ? t('editing') : ((template.name || '').replace(/^Шаблон\s*/i, '') || `#${template.id}`)}>
      {editing && form ? (
        <div>
          <div className="input-group">
            <div className="input-label">{t('templates.name')}</div>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder={t('templates.name')} />
          </div>

          <div className="input-group">
            <div className="input-label">{t('templates.linkContact')}</div>
            <select value={form.linked} onChange={e => {
              const val = e.target.value;
              set('linked', val);
              if (val.startsWith('user_')) {
                const u = (allUsers || []).find(x => String(x.id) === val.slice(5));
                if (u) { set('created_by', val.slice(5)); set('contact_name', u.name); }
              } else if (val.startsWith('sub_')) {
                const s = (allSubscribers || []).find(x => String(x.id) === val.slice(4));
                if (s) set('contact_name', s.full_name || s.username || '');
              }
            }}>
              <option value="">{t('templates.selectContact')}</option>
              {(allUsers || []).length > 0 && (
                <optgroup label={t('templates.systemUsers')}>
                  {(allUsers || []).map(u => (
                    <option key={`user_${u.id}`} value={`user_${u.id}`}>{u.name} ({u.role})</option>
                  ))}
                </optgroup>
              )}
              {(allSubscribers || []).length > 0 && (
                <optgroup label={t('templates.botContacts')}>
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
            <div className="input-label">{t('templates.crmStatus')}</div>
            <input value={form.deal_step} onChange={e => set('deal_step', e.target.value)} placeholder={t('templates.crmStatusPh')} />
          </div>

          <div className="input-group">
            <div className="input-label">{t('templates.dealType')}</div>
            <select value={form.deal_type} onChange={e => set('deal_type', e.target.value)}>
              <option value="rent">{TYPE_LABELS.rent}</option>
              <option value="sale">{TYPE_LABELS.sale}</option>
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="input-group">
              <div className="input-label">{t('templates.rentalFrom')}</div>
              <input type="date" value={form.rental_start} onChange={e => set('rental_start', e.target.value)} />
            </div>
            <div className="input-group">
              <div className="input-label">{t('to')}</div>
              <input type="date" value={form.rental_end} onChange={e => set('rental_end', e.target.value)} />
            </div>
          </div>

          <div className="input-group">
            <div className="input-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{t('templates.deadline')}</span>
              {!form.deadline && form.rental_end && (
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                  {t('templates.deadlineAuto')}: {fmt(addDays(form.rental_end, 28))}
                </span>
              )}
            </div>
            <input type="date" value={form.deadline} onChange={e => set('deadline', e.target.value)} placeholder={t('templates.deadlineAuto')} />
          </div>

          <div className="input-group">
            <div className="input-label">{t('templates.accounts')}</div>
            <textarea rows={2} value={form.accounts} onChange={e => set('accounts', e.target.value)} placeholder="ana-v, kate-m..." style={{ resize: 'vertical' }} />
          </div>

          <div className="input-group">
            <div className="input-label">{t('templates.contactName')}</div>
            <input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} />
          </div>
          <div className="input-group">
            <div className="input-label">{t('templates.contactEmail')}</div>
            <input type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} />
          </div>
          <div className="input-group">
            <div className="input-label">{t('templates.modelSites')}</div>
            <input value={form.model_sites} onChange={e => set('model_sites', e.target.value)} placeholder="MM, MK, Modelkartei..." />
          </div>
          <div className="input-group">
            <div className="input-label">{t('templates.accesses')}</div>
            <textarea rows={2} value={form.accesses} onChange={e => set('accesses', e.target.value)} style={{ resize: 'vertical' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="input-group">
              <div className="input-label">{t('templates.price')}</div>
              <input type="number" value={form.price} onChange={e => set('price', e.target.value)} />
            </div>
            <div className="input-group">
              <div className="input-label">{t('templates.responsible')}</div>
              <input value={form.responsible} onChange={e => set('responsible', e.target.value)} />
            </div>
          </div>

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {template.deal_step && (
              <span style={{ background: stepColor, color: '#fff', borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
                {getStepLabel(template.deal_step)}
              </span>
            )}
            {template.deal_type && (
              <span style={{ background: 'var(--bg3)', color: 'var(--text2)', borderRadius: 8, padding: '3px 10px', fontSize: 12 }}>
                {TYPE_LABELS[template.deal_type] || template.deal_type}
              </span>
            )}
            {template.price > 0 && (
              <span style={{ background: 'var(--bg3)', color: 'var(--text2)', borderRadius: 8, padding: '3px 10px', fontSize: 12 }}>
                💶 {template.price} EUR
              </span>
            )}
            {effDeadline && (() => {
              const daysLeft = Math.ceil((effDeadline - new Date()) / 86400000);
              const urgent = daysLeft <= 2;
              return (
                <span style={{ background: urgent ? 'var(--red, #ff3b30)' : 'var(--bg3)', color: urgent ? '#fff' : 'var(--text2)', borderRadius: 8, padding: '3px 10px', fontSize: 12 }}>
                  ⏰ {fmt(effDeadline)}{isAutoDeadline ? ` (${t('templates.deadlineAuto')})` : ''}
                </span>
              );
            })()}
          </div>

          <Row label={t('templates.contactName')} value={template.contact_name} />
          <Row label={t('templates.email')} value={template.contact_email} />
          <Row label={t('templates.modelSites')} value={template.model_sites} />
          <Row label={t('templates.accounts')} value={template.accounts} />
          <Row label={t('templates.accesses')} value={template.accesses} />
          <Row label={t('templates.responsible')} value={template.responsible} />
          <Row label={t('templates.rentalFrom')} value={template.rental_start && `${fmt(template.rental_start)} — ${fmt(template.rental_end)}`} />
          <Row label={t('templates.validUntil')} value={!template.rental_start && template.rental_end && fmt(template.rental_end)} />
          <Row label={t('templates.deadline')} value={effDeadline && `${fmt(effDeadline)}${isAutoDeadline ? ` (${t('templates.deadlineAuto')})` : ''}`} />
          <Row label={t('templates.created')} value={fmt(template.created_at)} />
          <Row label={t('templates.dealId')} value={template.deal_id} />

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
