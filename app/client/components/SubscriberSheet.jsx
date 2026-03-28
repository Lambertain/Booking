import React, { useState } from 'react';
import Sheet from './Sheet.jsx';
import { api } from '../api.js';

export default function SubscriberSheet({ subscriber, onClose, onUpdated, allTags }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tags, setTags] = useState(null);
  const [fullName, setFullName] = useState('');
  const [status, setStatus] = useState('');
  const [newTag, setNewTag] = useState('');

  if (!subscriber) return null;

  function openEdit() {
    setTags([...(subscriber.tags || [])]);
    setFullName(subscriber.full_name || '');
    setStatus(subscriber.status || 'active');
    setNewTag('');
    setEditing(true);
  }

  function removeTag(tag) {
    setTags(t => t.filter(x => x !== tag));
  }

  function addTag(tag) {
    const t = tag.trim();
    if (!t || tags.includes(t)) return;
    setTags(prev => [...prev, t]);
    setNewTag('');
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await api.patch(`/api/broadcast/subscriber/${subscriber.id}`, {
        tags,
        status,
        full_name: fullName,
      });
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

  // Tags not yet assigned to this subscriber (for quick-add)
  const unassigned = (allTags || []).filter(t => !(editing ? tags : subscriber.tags || []).includes(t));

  return (
    <Sheet open={!!subscriber} onClose={handleClose} title={editing ? '✏️ Редагування' : (subscriber.full_name || subscriber.username || `tg:${subscriber.telegram_id}`)}>
      {editing ? (
        <div>
          <div className="input-group">
            <div className="input-label">Ім'я</div>
            <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Повне ім'я" />
          </div>

          <div className="input-group">
            <div className="input-label">Статус</div>
            <select value={status} onChange={e => setStatus(e.target.value)}>
              <option value="active">✅ Активний</option>
              <option value="blocked">🚫 Заблокований</option>
            </select>
          </div>

          {/* Current tags */}
          <div className="input-label" style={{ marginBottom: 6 }}>Теги ({tags.length})</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {tags.map(tag => (
              <span
                key={tag}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: 'var(--accent)', color: '#fff',
                  borderRadius: 12, padding: '3px 10px', fontSize: 12,
                }}
              >
                {tag}
                <button
                  onClick={() => removeTag(tag)}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}
                >
                  ×
                </button>
              </span>
            ))}
            {tags.length === 0 && <span style={{ fontSize: 13, color: 'var(--text3)' }}>Тегів немає</span>}
          </div>

          {/* Add custom tag */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <input
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTag(newTag)}
              placeholder="Новий тег..."
              style={{ flex: 1 }}
            />
            <button className="btn btn-secondary" onClick={() => addTag(newTag)} disabled={!newTag.trim()}>
              + Додати
            </button>
          </div>

          {/* Quick-add from existing tags */}
          {unassigned.length > 0 && (
            <>
              <div className="input-label" style={{ marginBottom: 6 }}>Наявні теги (тисни для додавання)</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 16 }}>
                {unassigned.map(tag => (
                  <button
                    key={tag}
                    onClick={() => addTag(tag)}
                    style={{
                      padding: '3px 10px', borderRadius: 12, fontSize: 12, cursor: 'pointer',
                      border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text2)',
                    }}
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-full" onClick={() => setEditing(false)}>Скасувати</button>
            <button className="btn btn-primary btn-full" onClick={save} disabled={saving}>
              {saving ? 'Збереження...' : 'Зберегти'}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <span style={{
              background: subscriber.status === 'active' ? 'var(--green)' : 'var(--text3)',
              color: '#fff', borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 600,
            }}>
              {subscriber.status === 'active' ? '✅ Активний' : '🚫 Заблокований'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              ['Telegram', subscriber.username ? `@${subscriber.username}` : null],
              ['Telegram ID', subscriber.telegram_id],
              ['Підписався', subscriber.subscribed_at ? new Date(subscriber.subscribed_at).toLocaleDateString('uk-UA') : null],
              ['Активність', subscriber.last_activity_at ? new Date(subscriber.last_activity_at).toLocaleDateString('uk-UA') : null],
            ].map(([label, value]) => value ? (
              <div key={label} style={{ display: 'flex', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--separator)' }}>
                <span style={{ color: 'var(--text3)', fontSize: 13, minWidth: 110 }}>{label}</span>
                <span style={{ fontSize: 13 }}>{value}</span>
              </div>
            ) : null)}
          </div>

          {/* Tags */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 8 }}>
              Теги ({(subscriber.tags || []).length})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(subscriber.tags || []).length === 0 ? (
                <span style={{ fontSize: 13, color: 'var(--text3)' }}>Немає тегів</span>
              ) : (subscriber.tags || []).map(tag => (
                <span key={tag} style={{
                  background: 'var(--accent-bg)', color: 'var(--accent)',
                  borderRadius: 10, padding: '3px 10px', fontSize: 12,
                }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <button className="btn btn-primary btn-full" style={{ marginTop: 20 }} onClick={openEdit}>
            ✏️ Редагувати
          </button>
        </div>
      )}
    </Sheet>
  );
}
