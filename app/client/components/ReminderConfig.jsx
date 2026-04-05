import React, { useState } from 'react';
import { api } from '../api.js';
import { useLang } from '../i18n/useLang.js';

// Placeholders available in message text
const PLACEHOLDERS = ['{date}', '{name}'];

export default function ReminderConfig({ value, onChange, allSubscribers, msgTemplates, onTemplatesSaved }) {
  const { t } = useLang();
  const cfg = value || {};

  const [search, setSearch] = useState('');
  const [savingTpl, setSavingTpl] = useState(false);
  const [tplName, setTplName] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [showTplPicker, setShowTplPicker] = useState(false);

  function set(k, v) { onChange({ ...cfg, [k]: v }); }

  const selectedIds = cfg.recipient_ids || [];
  const selectedSubs = (allSubscribers || []).filter(s => selectedIds.includes(s.id));
  const filteredSubs = (allSubscribers || []).filter(s => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (s.full_name || '').toLowerCase().includes(term)
      || (s.username || '').toLowerCase().includes(term);
  });

  function toggleRecipient(subId) {
    const ids = selectedIds.includes(subId)
      ? selectedIds.filter(x => x !== subId)
      : [...selectedIds, subId];
    set('recipient_ids', ids);
  }

  async function saveAsTemplate() {
    if (!tplName.trim() || !cfg.message?.trim()) return;
    setSavingTpl(true);
    try {
      await api.post('/api/broadcast/message-templates', { name: tplName.trim(), text: cfg.message.trim(), tags: [] });
      setTplName('');
      setShowSaveForm(false);
      onTemplatesSaved?.();
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingTpl(false);
    }
  }

  function loadTemplate(tpl) {
    set('message', tpl.text);
    setShowTplPicker(false);
  }

  function statusBadge(sub) {
    if (sub.status === 'blocked') return { label: '🚫', color: 'var(--red, #ff3b30)' };
    return { label: '✅', color: 'var(--green, #34c759)' };
  }

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {t('reminder.title')}
      </div>

      {/* Days before */}
      <div className="input-group">
        <div className="input-label">{t('reminder.daysBefore')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="number"
            min="1"
            max="90"
            value={cfg.days_before || ''}
            onChange={e => set('days_before', parseInt(e.target.value) || null)}
            placeholder="7"
            style={{ width: 80 }}
          />
          <span style={{ fontSize: 13, color: 'var(--text2)' }}>{t('reminder.daysUnit')}</span>
        </div>
      </div>

      {/* Recipients */}
      <div className="input-group">
        <div className="input-label">{t('reminder.recipients')}</div>

        {/* Selected badges */}
        {selectedSubs.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
            {selectedSubs.map(sub => {
              const badge = statusBadge(sub);
              return (
                <span
                  key={sub.id}
                  onClick={() => toggleRecipient(sub.id)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: 'var(--accent-bg, rgba(10,132,255,0.12))', color: 'var(--accent)',
                    borderRadius: 20, padding: '3px 10px 3px 6px', fontSize: 12, cursor: 'pointer',
                    border: '1px solid var(--accent)',
                  }}
                >
                  <span style={{ fontSize: 10 }}>{badge.label}</span>
                  {sub.full_name || sub.username || `tg:${sub.telegram_id}`}
                  <span style={{ fontSize: 14, lineHeight: 1, opacity: 0.7 }}>×</span>
                </span>
              );
            })}
          </div>
        )}

        {/* Search + list */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('reminder.searchRecipients')}
          style={{ marginBottom: 4 }}
        />
        <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--separator)', borderRadius: 8 }}>
          {filteredSubs.length === 0 ? (
            <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text3)' }}>{t('reminder.noContacts')}</div>
          ) : filteredSubs.slice(0, 50).map(sub => {
            const selected = selectedIds.includes(sub.id);
            const badge = statusBadge(sub);
            return (
              <div
                key={sub.id}
                onClick={() => toggleRecipient(sub.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px',
                  cursor: 'pointer', borderBottom: '1px solid var(--separator)',
                  background: selected ? 'var(--accent-bg, rgba(10,132,255,0.08))' : 'transparent',
                }}
              >
                <span style={{ fontSize: 16 }}>{selected ? '☑' : '☐'}</span>
                <span style={{
                  fontSize: 10, padding: '1px 5px', borderRadius: 4,
                  background: sub.status === 'blocked' ? 'rgba(255,59,48,0.15)' : 'rgba(52,199,89,0.15)',
                  color: sub.status === 'blocked' ? 'var(--red, #ff3b30)' : 'var(--green, #34c759)',
                  fontWeight: 600, flexShrink: 0,
                }}>
                  {sub.status === 'blocked' ? t('users.blocked') : t('users.active')}
                </span>
                <span style={{ fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {sub.full_name || '—'}
                  {sub.username && <span style={{ color: 'var(--text3)', marginLeft: 4 }}>@{sub.username}</span>}
                </span>
              </div>
            );
          })}
        </div>
        {selectedIds.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
            {t('reminder.selectedCount').replace('{n}', selectedIds.length)}
          </div>
        )}
      </div>

      {/* Message */}
      <div className="input-group">
        <div className="input-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{t('reminder.message')}</span>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>
            {PLACEHOLDERS.map(p => (
              <span
                key={p}
                onClick={() => set('message', (cfg.message || '') + p)}
                style={{ marginLeft: 4, cursor: 'pointer', background: 'var(--bg3)', borderRadius: 4, padding: '1px 5px' }}
              >
                {p}
              </span>
            ))}
          </span>
        </div>
        <textarea
          rows={4}
          value={cfg.message || ''}
          onChange={e => set('message', e.target.value)}
          placeholder={t('reminder.messagePh')}
          style={{ resize: 'vertical' }}
        />
      </div>

      {/* Load / Save template buttons */}
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <button
            className="btn btn-secondary btn-full"
            style={{ fontSize: 12 }}
            onClick={() => setShowTplPicker(x => !x)}
          >
            📋 {t('reminder.loadTemplate')}
          </button>
          {showTplPicker && (msgTemplates || []).length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
              background: 'var(--bg)', border: '1px solid var(--separator)', borderRadius: 8,
              maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            }}>
              {(msgTemplates || []).map(tpl => (
                <div
                  key={tpl.id}
                  onClick={() => loadTemplate(tpl)}
                  style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--separator)', fontSize: 13 }}
                >
                  <div style={{ fontWeight: 600 }}>{tpl.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tpl.text}</div>
                </div>
              ))}
            </div>
          )}
          {showTplPicker && (msgTemplates || []).length === 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
              background: 'var(--bg)', border: '1px solid var(--separator)', borderRadius: 8,
              padding: '8px 12px', fontSize: 12, color: 'var(--text3)',
            }}>
              {t('broadcast.noTpls')}
            </div>
          )}
        </div>

        {!showSaveForm ? (
          <button
            className="btn btn-secondary"
            style={{ fontSize: 12, flexShrink: 0 }}
            onClick={() => setShowSaveForm(true)}
            disabled={!cfg.message?.trim()}
          >
            💾 {t('reminder.saveTemplate')}
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 4, flex: 1 }}>
            <input
              autoFocus
              value={tplName}
              onChange={e => setTplName(e.target.value)}
              placeholder={t('broadcast.tplNamePh')}
              style={{ flex: 1, fontSize: 12 }}
            />
            <button className="btn btn-primary btn-sm" style={{ fontSize: 12 }} onClick={saveAsTemplate} disabled={savingTpl || !tplName.trim()}>
              {savingTpl ? '…' : '✓'}
            </button>
            <button className="btn btn-secondary btn-sm" style={{ fontSize: 12 }} onClick={() => { setShowSaveForm(false); setTplName(''); }}>✕</button>
          </div>
        )}
      </div>
    </div>
  );
}
