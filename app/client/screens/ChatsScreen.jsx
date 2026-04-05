import React, { useEffect, useState, useRef } from 'react';
import { api } from '../api.js';
import { useLang } from '../i18n/useLang.js';
import Avatar from '../components/Avatar.jsx';
import TopBar from '../components/TopBar.jsx';
import Sheet from '../components/Sheet.jsx';

function BroadcastSheet({ open, onClose }) {
  const { t } = useLang();
  const [tags, setTags] = useState([]);
  const [allTotal, setAllTotal] = useState(0);
  const [selectedTags, setSelectedTags] = useState([]);
  const [count, setCount] = useState(0);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  // Template state
  const [templates, setTemplates] = useState([]);
  const [showSaveForm, setShowSaveForm] = useState(false); // save current text
  const [showCreateForm, setShowCreateForm] = useState(false); // create from scratch
  const [saveName, setSaveName] = useState('');
  const [saveText, setSaveText] = useState('');
  const [saveTags, setSaveTags] = useState([]);
  const [savingTpl, setSavingTpl] = useState(false);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    api.get('/api/broadcast/tags').then(d => {
      setTags(d.tags || []);
      setAllTotal(d.total || 0);
      setCount(d.total || 0);
    });
    api.get('/api/broadcast/message-templates').then(setTemplates).catch(() => {});
  }, [open]);

  async function updateCount(newTags) {
    const q = newTags.length ? `?tags=${newTags.map(encodeURIComponent).join(',')}` : '';
    const d = await api.get(`/api/broadcast/subscribers${q}`);
    setCount(d.count);
  }

  function toggleTag(tag) {
    setSelectedTags(prev => {
      const next = prev.includes(tag) ? prev.filter(tg => tg !== tag) : [...prev, tag];
      updateCount(next);
      return next;
    });
  }

  async function send() {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const d = await api.post('/api/broadcast', { text: text.trim(), tags: selectedTags });
      setResult(t('broadcast.sentResult', { count: d.count }));
      setText('');
    } catch (err) {
      setResult(`❌ ${err.message}`);
    } finally {
      setSending(false);
    }
  }

  async function saveTemplate(nameVal, textVal, tagsVal) {
    if (!nameVal?.trim() || !textVal?.trim()) return;
    setSavingTpl(true);
    try {
      const tpl = await api.post('/api/broadcast/message-templates', {
        name: nameVal.trim(), text: textVal.trim(), tags: tagsVal || [],
      });
      setTemplates(prev => [tpl, ...prev]);
      setSaveName(''); setSaveText(''); setSaveTags([]);
      setShowSaveForm(false); setShowCreateForm(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingTpl(false);
    }
  }

  function toggleSaveTag(tag) {
    setSaveTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }

  async function deleteTemplate(id, e) {
    e.stopPropagation();
    if (!confirm(t('broadcast.deleteTplConfirm'))) return;
    await api.delete(`/api/broadcast/message-templates/${id}`).catch(() => {});
    setTemplates(prev => prev.filter(tp => tp.id !== id));
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('broadcast.title')}>

      {/* Templates picker */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>{t('broadcast.templates')}</div>
          <button onClick={() => { setShowCreateForm(true); setShowSaveForm(false); setSaveName(''); setSaveText(''); }}
            style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            + {t('broadcast.newTpl')}
          </button>
        </div>
        {templates.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {templates.map(tp => (
              <div key={tp.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <button
                  onClick={() => {
                    setText(tp.text);
                    if (tp.tags?.length) {
                      setSelectedTags(tp.tags);
                      updateCount(tp.tags);
                    }
                  }}
                  title={tp.text}
                  style={{
                    padding: '4px 10px', borderRadius: 12, fontSize: 12, cursor: 'pointer',
                    border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text1)',
                  }}
                >
                  {tp.name}{tp.tags?.length ? ` (${tp.tags.join(', ')})` : ''}
                </button>
                <button onClick={e => deleteTemplate(tp.id, e)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14, padding: '0 2px', lineHeight: 1 }}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {templates.length === 0 && !showCreateForm && (
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>{t('broadcast.noTpls')}</div>
        )}

        {/* Create template from scratch */}
        {showCreateForm && (
          <div style={{ marginTop: 8, padding: '10px', borderRadius: 10, background: 'var(--bg2)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>{t('broadcast.newTpl')}</div>
            <input
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              placeholder={t('broadcast.tplNamePh')}
              style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text1)', fontSize: 13, marginBottom: 6, boxSizing: 'border-box' }}
            />
            <textarea
              value={saveText}
              onChange={e => setSaveText(e.target.value)}
              placeholder={t('broadcast.tplTextPh')}
              rows={4}
              style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text1)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box', marginBottom: 6 }}
            />
            {tags.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>{t('broadcast.tplTagsHint')}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {tags.map(({ tag }) => (
                    <button key={tag} onClick={() => toggleSaveTag(tag)} style={{
                      padding: '3px 8px', borderRadius: 10, fontSize: 11, cursor: 'pointer',
                      border: '1px solid var(--border)',
                      background: saveTags.includes(tag) ? 'var(--accent)' : 'var(--bg3)',
                      color: saveTags.includes(tag) ? '#fff' : 'var(--text2)',
                    }}>
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-primary" onClick={() => saveTemplate(saveName, saveText, saveTags)}
                disabled={!saveName.trim() || !saveText.trim() || savingTpl} style={{ flex: 1 }}>
                {savingTpl ? '…' : t('save')}
              </button>
              <button className="btn btn-secondary" onClick={() => { setShowCreateForm(false); setSaveName(''); setSaveText(''); setSaveTags([]); }}>
                {t('cancel')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tags */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>{t('broadcast.tagsHint')}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {tags.map(({ tag, count: tc }) => (
            <button key={tag} onClick={() => toggleTag(tag)} style={{
              padding: '4px 10px', borderRadius: 12, fontSize: 12, cursor: 'pointer', border: '1px solid var(--border)',
              background: selectedTags.includes(tag) ? 'var(--accent)' : 'var(--bg3)',
              color: selectedTags.includes(tag) ? '#fff' : 'var(--text1)',
            }}>
              {tag} ({tc})
            </button>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
        {t('broadcast.recipients')} <b style={{ color: 'var(--text1)' }}>{count}</b> {t('broadcast.ofActive', { total: allTotal })}
      </div>

      <div className="input-group">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div className="input-label" style={{ marginBottom: 0 }}>{t('broadcast.messageLabel')}</div>
          {text.trim() && !showSaveForm && (
            <button onClick={() => setShowSaveForm(true)} style={{
              fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            }}>
              + {t('broadcast.saveAsTpl')}
            </button>
          )}
        </div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={5}
          placeholder={t('broadcast.messagePh')}
          style={{ resize: 'vertical' }}
        />
      </div>

      {/* Save current text as template */}
      {showSaveForm && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            placeholder={t('broadcast.tplNamePh')}
            style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text1)', fontSize: 13 }}
            onKeyDown={e => e.key === 'Enter' && saveTemplate(saveName, text.trim(), selectedTags)}
          />
          <button className="btn btn-primary" onClick={() => saveTemplate(saveName, text.trim(), selectedTags)}
            disabled={!saveName.trim() || savingTpl} style={{ whiteSpace: 'nowrap' }}>
            {savingTpl ? '…' : t('save')}
          </button>
          <button className="btn btn-secondary" onClick={() => { setShowSaveForm(false); setSaveName(''); }}>✕</button>
        </div>
      )}

      {result && (
        <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--bg3)', fontSize: 13, marginBottom: 8 }}>
          {result}
        </div>
      )}

      <button className="btn btn-primary btn-full" onClick={send} disabled={!text.trim() || sending}>
        {sending ? t('broadcast.sending') : t('broadcast.send', { count })}
      </button>
    </Sheet>
  );
}

export default function ChatsScreen({ user, onChatActive }) {
  const { t } = useLang();
  const [convs, setConvs] = useState([]);
  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [startingChat, setStartingChat] = useState(false);

  const isManager = user.role === 'admin' || user.role === 'manager';
  const canBroadcast = isManager;

  useEffect(() => {
    api.get('/api/conversations').then(convList => {
      // Non-managers only see their own conversations (client-side safety filter)
      const filtered = isManager
        ? convList
        : convList.filter(c => c.participant_a === user.id || c.participant_b === user.id);
      setConvs(filtered);
      // Auto-open if exactly 1 conversation
      if (!isManager && filtered.length === 1) {
        setActive(filtered[0]);
        onChatActive?.(true);
      }
    }).finally(() => setLoading(false));
  }, []);

  async function startChatWithManager() {
    setStartingChat(true);
    try {
      const conv = await api.post('/api/conversations/with-manager', {});
      setConvs([conv]);
      setActive(conv);
      onChatActive?.(true);
    } catch (err) {
      alert(err.message);
    } finally {
      setStartingChat(false);
    }
  }

  if (active) {
    return (
      <ChatThread
        conv={active}
        user={user}
        onBack={() => { setActive(null); onChatActive?.(false); }}
        onConvUpdated={updated => setConvs(c => c.map(x => x.id === updated.id ? updated : x))}
      />
    );
  }

  function convName(c) {
    if (c.participant_a === user.id) return c.participant_b_name;
    return c.participant_a_name;
  }

  function convBotBlocked(c) {
    const aIsClient = !['admin','manager'].includes(c.participant_a_role);
    const subStatus = aIsClient ? c.participant_a_sub_status : c.participant_b_sub_status;
    return subStatus === 'blocked';
  }

  if (loading) return <div className="loader"><div className="spinner" /></div>;

  return (
    <div className="screen">
      <div style={{ padding: '16px 16px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>{t('nav.chats')}</h1>
        {canBroadcast && (
          <button
            onClick={() => setBroadcastOpen(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22 }}
            title={t('broadcast.tooltip')}
          >
            📣
          </button>
        )}
      </div>
      <div className="card" style={{ margin: '0 16px' }}>
        {convs.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">💬</div>
            <div className="empty-title">{t('conversations.noChats')}</div>
            {!isManager && (
              <button
                className="btn btn-primary"
                style={{ marginTop: 12 }}
                onClick={startChatWithManager}
                disabled={startingChat}
              >
                {startingChat ? t('loading') : t('nav.chat')}
              </button>
            )}
          </div>
        ) : convs.map(c => {
          const name = convName(c);
          const unread = parseInt(c.unread) || 0;
          const blocked = convBotBlocked(c);
          return (
            <div key={c.id} className="list-item" onClick={() => { setActive(c); onChatActive?.(true); }}>
              <Avatar name={name} size={44} />
              <div className="list-item-body">
                <div className="list-item-title">
                  {name}
                  {blocked && <span title={t('users.botBlocked')} style={{ marginLeft: 6, fontSize: 14 }}>🚫</span>}
                </div>
                <div className="list-item-subtitle">{c.last_message || t('conversations.noMessages')}</div>
              </div>
              <div className="list-item-right" style={{ flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                {c.last_message_at && (
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                    {new Date(c.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                {unread > 0 && (
                  <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: 10, padding: '2px 7px', fontSize: 12, fontWeight: 700 }}>
                    {unread}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <BroadcastSheet open={broadcastOpen} onClose={() => setBroadcastOpen(false)} />
    </div>
  );
}

function ChatThread({ conv, user, onBack }) {
  const { t } = useLang();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [registerSheet, setRegisterSheet] = useState(false);
  const [regForm, setRegForm] = useState({ role: 'model', name: '' });
  const bottomRef = useRef(null);
  const esRef = useRef(null);
  const fileRef = useRef(null);

  const otherName = conv.participant_a === user.id ? conv.participant_b_name : conv.participant_a_name;

  useEffect(() => {
    api.get(`/api/conversations/${conv.id}/messages`).then(setMessages);

    esRef.current?.close();
    const token = localStorage.getItem('token');
    const es = new EventSource(`/api/conversations/${conv.id}/events?token=${token}`);
    es.onmessage = e => {
      const data = JSON.parse(e.data);
      if (data.type === 'message') setMessages(m => [...m, data.message]);
    };
    esRef.current = es;
    return () => es.close();
  }, [conv.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send() {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const msg = await api.post(`/api/conversations/${conv.id}/messages`, { text: text.trim() });
      setMessages(m => [...m, msg]);
      setText('');
    } finally {
      setSending(false);
    }
  }

  async function sendFile(file) {
    const reader = new FileReader();
    reader.onload = async e => {
      const base64 = e.target.result.split(',')[1];
      try {
        const media = await api.post('/api/media/upload', {
          data: base64, mimeType: file.type, fileName: file.name
        });
        const mediaType = file.type.startsWith('image') ? 'image' : file.type.startsWith('video') ? 'video' : 'file';
        const msg = await api.post(`/api/conversations/${conv.id}/messages`, {
          text: file.name,
          media_url: media.url,
          media_type: mediaType,
          media_name: file.name,
          media_file_id: media.file_id || null,
        });
        setMessages(m => [...m, msg]);
      } catch (err) {
        alert('Upload error: ' + err.message);
      }
    };
    reader.readAsDataURL(file);
  }

  async function registerUser() {
    await api.post('/api/users', {
      role: regForm.role,
      name: regForm.name,
      telegram_id: conv.participant_a === user.id
        ? /* other participant */ null
        : null,
    });
    setRegisterSheet(false);
  }

  const canRegister = (user.role === 'admin' || user.role === 'manager');

  return (
    <div style={{ height: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <TopBar
        title={otherName}
        left={<button className="back-btn" onClick={onBack}>‹ {t('back')}</button>}
        right={canRegister && (
          <button onClick={() => setRegisterSheet(true)} style={{
            width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)',
            border: 'none', color: '#fff', fontSize: 22, lineHeight: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0,
          }}>+</button>
        )}
      />

      <div className="chat-messages" style={{ paddingTop: 'var(--topbar-h)' }}>
        {messages.map(m => {
          const mine = m.sender_id === user.id;
          return (
            <div key={m.id} className={`bubble-wrap ${mine ? 'mine' : 'theirs'}`}>
              {!mine && <div className="bubble-sender">{m.sender_name}</div>}
              <div className={`bubble ${mine ? 'mine' : 'theirs'}`}>
                {m.media_url && m.media_type === 'image' && (
                  <div className="bubble-media" style={{ marginBottom: m.text !== m.media_name ? 6 : 0 }}>
                    <img src={m.media_url} alt={m.media_name} />
                  </div>
                )}
                {m.media_url && m.media_type === 'video' && (
                  <div className="bubble-media" style={{ marginBottom: 6 }}>
                    <video src={m.media_url} controls />
                  </div>
                )}
                {m.media_url && m.media_type === 'file' && (
                  <a href={m.media_url} target="_blank" rel="noreferrer" style={{ color: mine ? '#fff' : 'var(--accent)' }}>
                    📎 {m.media_name || m.text}
                  </a>
                )}
                {(!m.media_url || m.text !== m.media_name) && m.text}
                <div className="bubble-time">
                  {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-area">
        <input type="file" ref={fileRef} style={{ display: 'none' }} accept="image/*,video/*,*/*"
          onChange={e => e.target.files[0] && sendFile(e.target.files[0])} />
        <button className="chat-attach-btn" onClick={() => fileRef.current.click()}>📎</button>
        <textarea
          className="chat-input"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={t('conversations.messagePlaceholder')}
          rows={1}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <button className="chat-send-btn" onClick={send} disabled={!text.trim() || sending}>↑</button>
      </div>

      <Sheet open={registerSheet} onClose={() => setRegisterSheet(false)} title={t('users.register')}>
        <div className="input-group">
          <div className="input-label">{t('users.name')}</div>
          <input value={regForm.name} onChange={e => setRegForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="input-group">
          <div className="input-label">{t('users.role')}</div>
          <select value={regForm.role} onChange={e => setRegForm(f => ({ ...f, role: e.target.value }))}>
            <option value="model">Model</option>
            <option value="client">Client</option>
            <option value="manager">Manager</option>
          </select>
        </div>
        <button className="btn btn-primary btn-full" onClick={registerUser}>{t('users.create')}</button>
      </Sheet>
    </div>
  );
}
