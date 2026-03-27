import React, { useEffect, useState, useRef } from 'react';
import { api } from '../../api.js';
import { useLang } from '../../i18n/useLang.js';

export default function ConversationsPage({ user }) {
  const { t } = useLang();
  const [convs, setConvs] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef(null);
  const esRef = useRef(null);

  useEffect(() => {
    api.get('/api/conversations').then(setConvs).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!active) return;
    api.get(`/api/conversations/${active.id}/messages`).then(setMessages);

    esRef.current?.close();
    const token = localStorage.getItem('token');
    const es = new EventSource(`/api/conversations/${active.id}/events?token=${token}`);
    es.onmessage = e => {
      const data = JSON.parse(e.data);
      if (data.type === 'message') setMessages(m => [...m, data.message]);
    };
    esRef.current = es;
    return () => es.close();
  }, [active?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send() {
    if (!text.trim()) return;
    const msg = await api.post(`/api/conversations/${active.id}/messages`, { text });
    setMessages(m => [...m, msg]);
    setText('');
  }

  function convLabel(c) {
    if (c.participant_a === user.id) return c.participant_b_name;
    return c.participant_a_name;
  }

  if (loading) return <div className="loader">{t('loading')}</div>;

  return (
    <div style={{ display: 'flex', height: 'calc(100dvh - 48px)', gap: 0 }}>
      <div style={{ width: 260, borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
        <div style={{ padding: '12px 16px', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>
          {t('conversations.title')}
        </div>
        {convs.map(c => (
          <div key={c.id} onClick={() => setActive(c)}
               style={{
                 padding: '12px 16px', cursor: 'pointer',
                 background: active?.id === c.id ? 'var(--bg3)' : 'transparent',
                 borderBottom: '1px solid var(--border)',
               }}>
            <div style={{ fontWeight: 500 }}>{convLabel(c)}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {c.last_message || t('conversations.noMessages')}
            </div>
            {parseInt(c.unread) > 0 && (
              <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 11, float: 'right', marginTop: -18 }}>
                {c.unread}
              </span>
            )}
          </div>
        ))}
        {convs.length === 0 && <div style={{ padding: 20, color: 'var(--text2)' }}>{t('conversations.noChats')}</div>}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {!active ? (
          <div className="loader">{t('conversations.selectChat')}</div>
        ) : (
          <>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
              {convLabel(active)}
            </div>
            <div className="chat-messages">
              {messages.map(m => (
                <div key={m.id} className={`chat-bubble ${m.sender_id === user.id ? 'mine' : 'theirs'}`}>
                  {m.sender_id !== user.id && (
                    <div style={{ fontSize: 11, opacity: .6, marginBottom: 4 }}>{m.sender_name}</div>
                  )}
                  {m.text}
                  <div className="meta">
                    {new Date(m.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <div className="chat-input-row">
              <input
                value={text} onChange={e => setText(e.target.value)}
                placeholder={t('conversations.messagePlaceholder')}
                onKeyDown={e => e.key === 'Enter' && send()}
              />
              <button className="btn-primary" onClick={send}>{t('conversations.send')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
