import React, { useState } from 'react';
import Sheet from './Sheet.jsx';
import { api } from '../api.js';
import { useLang } from '../i18n/useLang.js';

export default function SubscriberSheet({ subscriber, onClose, onUpdated, allTags }) {
  const { t } = useLang();
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
    setTags(tgs => tgs.filter(x => x !== tag));
  }

  function addTag(tag) {
    const trimmed = tag.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    setTags(prev => [...prev, trimmed]);
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

  const unassigned = (allTags || []).filter(tag => !(editing ? tags : subscriber.tags || []).includes(tag));

  return (
    <Sheet open={!!subscriber} onClose={handleClose} title={editing ? t('editing') : (subscriber.full_name || subscriber.username || `tg:${subscriber.telegram_id}`)}>
      {editing ? (
        <div>
          <div className="input-group">
            <div className="input-label">{t('subscriber.name')}</div>
            <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder={t('subscriber.fullNamePh')} />
          </div>

          <div className="input-group">
            <div className="input-label">{t('subscriber.status')}</div>
            <select value={status} onChange={e => setStatus(e.target.value)}>
              <option value="active">{t('subscriber.active')}</option>
              <option value="blocked">{t('subscriber.blocked')}</option>
            </select>
          </div>

          <div className="input-label" style={{ marginBottom: 6 }}>{t('subscriber.tags')} ({tags.length})</div>
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
            {tags.length === 0 && <span style={{ fontSize: 13, color: 'var(--text3)' }}>{t('subscriber.noTags')}</span>}
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <input
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTag(newTag)}
              placeholder={t('subscriber.newTagPh')}
              style={{ flex: 1 }}
            />
            <button className="btn btn-secondary" onClick={() => addTag(newTag)} disabled={!newTag.trim()}>
              {t('subscriber.addTag')}
            </button>
          </div>

          {unassigned.length > 0 && (
            <>
              <div className="input-label" style={{ marginBottom: 6 }}>{t('subscriber.availableTags')}</div>
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
            <button className="btn btn-secondary btn-full" onClick={() => setEditing(false)}>{t('cancel')}</button>
            <button className="btn btn-primary btn-full" onClick={save} disabled={saving}>
              {saving ? t('saving') : t('save')}
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
              {subscriber.status === 'active' ? t('subscriber.active') : t('subscriber.blocked')}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              ['Telegram', subscriber.username ? `@${subscriber.username}` : null],
              ['Telegram ID', subscriber.telegram_id],
              [t('subscriber.subscribedAt'), subscriber.subscribed_at ? new Date(subscriber.subscribed_at).toLocaleDateString() : null],
              [t('subscriber.lastActivity'), subscriber.last_activity_at ? new Date(subscriber.last_activity_at).toLocaleDateString() : null],
            ].map(([label, value]) => value ? (
              <div key={label} style={{ display: 'flex', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--separator)' }}>
                <span style={{ color: 'var(--text3)', fontSize: 13, minWidth: 110 }}>{label}</span>
                <span style={{ fontSize: 13 }}>{value}</span>
              </div>
            ) : null)}
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 8 }}>
              {t('subscriber.tags')} ({(subscriber.tags || []).length})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(subscriber.tags || []).length === 0 ? (
                <span style={{ fontSize: 13, color: 'var(--text3)' }}>{t('subscriber.noTags')}</span>
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
            {t('subscriber.edit')}
          </button>
        </div>
      )}
    </Sheet>
  );
}
