import React, { useState } from 'react';
import Sheet from './Sheet.jsx';
import { api } from '../api.js';

export default function TagManagerSheet({ open, onClose, tags, onTagsChanged }) {
  const [renaming, setRenaming] = useState(null); // { oldName, newName }
  const [saving, setSaving] = useState(false);
  const [newTagName, setNewTagName] = useState('');

  async function saveRename() {
    if (!renaming?.newName.trim() || renaming.newName === renaming.oldName) {
      setRenaming(null);
      return;
    }
    setSaving(true);
    try {
      await api.patch('/api/broadcast/tag-rename', {
        oldName: renaming.oldName,
        newName: renaming.newName.trim(),
      });
      onTagsChanged?.();
      setRenaming(null);
    } finally {
      setSaving(false);
    }
  }

  async function deleteTag(name) {
    if (!confirm(`Видалити тег "${name}" у всіх підписників?`)) return;
    setSaving(true);
    try {
      await api.delete(`/api/broadcast/tag/${encodeURIComponent(name)}`);
      onTagsChanged?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="🏷️ Управління тегами">
      <div style={{ marginBottom: 4, fontSize: 13, color: 'var(--text3)' }}>
        {tags.length} тегів • зміни застосовуються до всіх підписників
      </div>

      <div style={{ marginBottom: 14, display: 'flex', gap: 6 }}>
        <input
          value={newTagName}
          onChange={e => setNewTagName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && newTagName.trim() && setRenaming({ oldName: '', newName: newTagName.trim() })}
          placeholder="Назва нового тегу..."
          style={{ flex: 1 }}
        />
        <button
          className="btn btn-secondary"
          disabled={!newTagName.trim()}
          onClick={() => {
            // "New tag" just copies to clipboard or shows as reminder —
            // actual tag creation happens when assigning to a subscriber
            alert(`Тег "${newTagName.trim()}" можна призначити підписнику через редагування контакту`);
            setNewTagName('');
          }}
        >
          + Новий
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {tags.map(({ tag, count }) => (
          <div
            key={tag}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 0', borderBottom: '1px solid var(--separator)',
            }}
          >
            {renaming?.oldName === tag ? (
              <>
                <input
                  value={renaming.newName}
                  onChange={e => setRenaming(r => ({ ...r, newName: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setRenaming(null); }}
                  autoFocus
                  style={{ flex: 1, fontSize: 13 }}
                />
                <button
                  className="btn btn-primary"
                  style={{ padding: '4px 10px', fontSize: 12 }}
                  onClick={saveRename}
                  disabled={saving}
                >
                  ✓
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '4px 10px', fontSize: 12 }}
                  onClick={() => setRenaming(null)}
                >
                  ✕
                </button>
              </>
            ) : (
              <>
                <span style={{
                  flex: 1, fontSize: 13,
                  background: 'var(--accent-bg)', color: 'var(--accent)',
                  borderRadius: 8, padding: '3px 10px', display: 'inline-block',
                }}>
                  {tag}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text3)', minWidth: 30, textAlign: 'right' }}>
                  {count}
                </span>
                <button
                  onClick={() => setRenaming({ oldName: tag, newName: tag })}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--text3)', padding: '0 4px' }}
                  title="Перейменувати"
                >
                  ✏️
                </button>
                <button
                  onClick={() => deleteTag(tag)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--red)', padding: '0 4px' }}
                  title="Видалити тег"
                  disabled={saving}
                >
                  🗑️
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </Sheet>
  );
}
