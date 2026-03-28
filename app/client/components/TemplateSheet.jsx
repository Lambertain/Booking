import React, { useState } from 'react';
import Sheet from './Sheet.jsx';
import { api } from '../api.js';

const STEP_LABELS = {
  'В работе': 'В роботі',
  'Удалить': 'Видалити',
  'Готово': 'Виконано',
};

const STEP_COLORS = {
  'В работе': 'var(--accent)',
  'Удалить': 'var(--red)',
  'Готово': 'var(--green)',
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

export default function TemplateSheet({ template, onClose, canEdit, onUpdated, allUsers }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  if (!template) return null;

  function openEdit() {
    setForm({
      name: template.name || '',
      deal_step: template.deal_step || '',
      price: template.price || '',
      rental_start: template.rental_start ? template.rental_start.slice(0, 10) : '',
      rental_end: template.rental_end ? template.rental_end.slice(0, 10) : '',
      model_sites: template.model_sites || '',
      accesses: template.accesses || '',
      contact_name: template.contact_name || '',
      contact_email: template.contact_email || '',
      deal_type: template.deal_type || '',
      responsible: template.responsible || '',
      created_by: '',
    });
    setEditing(true);
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function save() {
    setSaving(true);
    try {
      const payload = { ...form };
      if (!payload.created_by) delete payload.created_by;
      const updated = await api.patch(`/api/templates/${template.id}`, payload);
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

  const stepColor = STEP_COLORS[template.deal_step] || 'var(--text3)';
  const stepLabel = STEP_LABELS[template.deal_step] || template.deal_step;

  return (
    <Sheet open={!!template} onClose={handleClose} title={editing ? '✏️ Редагування' : (template.name || `#${template.id}`)}>
      {editing && form ? (
        <div>
          <div className="input-group">
            <div className="input-label">Назва</div>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Назва шаблону" />
          </div>

          <div className="input-group">
            <div className="input-label">Прив'язати до юзера</div>
            <select value={form.created_by} onChange={e => {
              const uid = e.target.value;
              const u = allUsers?.find(x => String(x.id) === uid);
              set('created_by', uid);
              if (u) set('contact_name', u.name);
            }}>
              <option value="">— Оберіть юзера —</option>
              {(allUsers || []).map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
              ))}
            </select>
          </div>

          <div className="input-group">
            <div className="input-label">Статус CRM</div>
            <input value={form.deal_step} onChange={e => set('deal_step', e.target.value)} placeholder="В работе, Удалить..." />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="input-group">
              <div className="input-label">Оренда від</div>
              <input type="date" value={form.rental_start} onChange={e => set('rental_start', e.target.value)} />
            </div>
            <div className="input-group">
              <div className="input-label">до</div>
              <input type="date" value={form.rental_end} onChange={e => set('rental_end', e.target.value)} />
            </div>
          </div>

          <div className="input-group">
            <div className="input-label">Контакт</div>
            <input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} />
          </div>
          <div className="input-group">
            <div className="input-label">Email контакту</div>
            <input type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} />
          </div>
          <div className="input-group">
            <div className="input-label">Сайти моделі</div>
            <input value={form.model_sites} onChange={e => set('model_sites', e.target.value)} placeholder="MM, MK, Modelkartei..." />
          </div>
          <div className="input-group">
            <div className="input-label">Доступи</div>
            <textarea rows={2} value={form.accesses} onChange={e => set('accesses', e.target.value)} style={{ resize: 'vertical' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="input-group">
              <div className="input-label">Ціна (EUR)</div>
              <input type="number" value={form.price} onChange={e => set('price', e.target.value)} />
            </div>
            <div className="input-group">
              <div className="input-label">Тип угоди</div>
              <input value={form.deal_type} onChange={e => set('deal_type', e.target.value)} />
            </div>
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
            {template.deal_step && (
              <span style={{ background: stepColor, color: '#fff', borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
                {stepLabel}
              </span>
            )}
            {template.price > 0 && (
              <span style={{ background: 'var(--bg3)', color: 'var(--text2)', borderRadius: 8, padding: '3px 10px', fontSize: 12 }}>
                💶 {template.price} EUR
              </span>
            )}
          </div>

          <Row label="Контакт" value={template.contact_name} />
          <Row label="Email" value={template.contact_email} />
          <Row label="Сайти моделі" value={template.model_sites} />
          <Row label="Доступи" value={template.accesses} />
          <Row label="Тип угоди" value={template.deal_type} />
          <Row label="Відповідальний" value={template.responsible} />
          <Row label="Оренда від" value={template.rental_start && `${fmt(template.rental_start)} — ${fmt(template.rental_end)}`} />
          <Row label="Дійсний до" value={!template.rental_start && template.rental_end && fmt(template.rental_end)} />
          <Row label="Створено" value={fmt(template.created_at)} />
          <Row label="Deal ID" value={template.deal_id} />

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
