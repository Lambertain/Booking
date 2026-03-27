import React, { useEffect, useState, useRef } from 'react';
import { api } from '../api.js';
import { useLang } from '../i18n/useLang.js';
import Avatar from '../components/Avatar.jsx';
import TopBar from '../components/TopBar.jsx';
import Sheet from '../components/Sheet.jsx';

export default function ChatsScreen({ user }) {
  const { t } = useLang();
  const [convs, setConvs] = useState([]);
  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/conversations').then(setConvs).finally(() => setLoading(false));
  }, []);

  if (active) {
    return (
      <ChatThread
        conv={active}
        user={user}
        onBack={() => setActive(null)}
        onConvUpdated={updated => setConvs(c => c.map(x => x.id === updated.id ? updated : x))}
      />
    );
  }

  function convName(c) {
    if (c.participant_a === user.id) return c.participant_b_name;
    return c.participant_a_name;
  }

  if (loading) return <div className="loader"><div className="spinner" /></div>;

  return (
    <div className="screen">
      <div style={{ padding: '16px 16px 8px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>{t('nav.chats')}</h1>
      </div>
      <div className="card" style={{ margin: '0 16px' }}>
        {convs.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">💬</div>
            <div className="empty-title">{t('conversations.noChats')}</div>
          </div>
        ) : convs.map(c => {
          const name = convName(c);
          const unread = parseInt(c.unread) || 0;
          return (
            <div key={c.id} className="list-item" onClick={() => setActive(c)}>
              <Avatar name={name} size={44} />
              <div className="list-item-body">
                <div className="list-item-title">{name}</div>
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
        const msg = await api.post(`/api/conversations/${conv.id}/messages`, {
          text: file.name,
          media_url: media.url,
          media_type: file.type.startsWith('image') ? 'image' : file.type.startsWith('video') ? 'video' : 'file',
          media_name: file.name,
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      <TopBar
        title={otherName}
        left={<button className="back-btn" onClick={onBack}>‹ {t('back')}</button>}
        right={canRegister && (
          <button className="btn btn-sm btn-secondary" onClick={() => setRegisterSheet(true)}>
            + {t('users.register')}
          </button>
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
