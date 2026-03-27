import React, { useEffect, useState, useRef } from 'react';
import { api } from '../../api.js';
import { useLang } from '../../i18n/useLang.js';
import Sheet from '../../components/Sheet.jsx';

function BroadcastPanel({ onClose }) {
  const [tags, setTags] = useState([]);
  const [allTotal, setAllTotal] = useState(0);
  const [selectedTags, setSelectedTags] = useState([]);
  const [count, setCount] = useState(0);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.get('/api/broadcast/tags').then(d => {
      setTags(d.tags || []);
      setAllTotal(d.total || 0);
      setCount(d.total || 0);
    });
  }, []);

  async function updateCount(newTags) {
    const q = newTags.length ? `?tags=${newTags.map(encodeURIComponent).join(',')}` : '';
    const d = await api.get(`/api/broadcast/subscribers${q}`);
    setCount(d.count);
  }

  function toggleTag(tag) {
    setSelectedTags(prev => {
      const next = prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag];
      updateCount(next);
      return next;
    });
  }

  async function send() {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const d = await api.post('/api/broadcast', { text: text.trim(), tags: selectedTags });
      setResult(`✅ Відправляється ${d.count} повідомлень`);
      setText('');
    } catch (err) {
      setResult(`❌ ${err.message}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ padding: 16, borderLeft: '1px solid var(--border)', width: 320, overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontWeight: 600 }}>📣 Розсилка</div>
        <button className="btn-ghost" style={{ fontSize: 18 }} onClick={onClose}>×</button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Теги:</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
        {tags.map(({ tag, count: tc }) => (
          <button key={tag} onClick={() => toggleTag(tag)}
            style={{ padding: '3px 8px', borderRadius: 10, fontSize: 11, cursor: 'pointer', border: '1px solid var(--border)',
              background: selectedTags.includes(tag) ? 'var(--accent)' : 'var(--bg3)',
              color: selectedTags.includes(tag) ? '#fff' : 'var(--text1)' }}>
            {tag} ({tc})
          </button>
        ))}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
        Отримувачів: <b style={{ color: 'var(--text1)' }}>{count}</b> / {allTotal}
      </div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={5}
        placeholder="Текст повідомлення..."
        style={{ width: '100%', resize: 'vertical', marginBottom: 8, padding: 8, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text1)', fontSize: 13, boxSizing: 'border-box' }}
      />
      {result && <div style={{ fontSize: 12, marginBottom: 8, color: result.startsWith('✅') ? 'var(--green)' : 'var(--red)' }}>{result}</div>}
      <button className="btn-primary" style={{ width: '100%' }} onClick={send} disabled={!text.trim() || sending}>
        {sending ? 'Відправка...' : `Надіслати (${count})`}
      </button>
    </div>
  );
}

export default function ConversationsPage({ user }) {
  const { t } = useLang();
  const [convs, setConvs] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
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

  function convBotBlocked(c) {
    const aIsClient = !['admin','manager'].includes(c.participant_a_role);
    const subStatus = aIsClient ? c.participant_a_sub_status : c.participant_b_sub_status;
    return subStatus === 'blocked';
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100dvh - 48px)', gap: 0 }}>
      <div style={{ width: 260, borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
        <div style={{ padding: '12px 16px', fontWeight: 600, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {t('conversations.title')}
          <button onClick={() => setBroadcastOpen(v => !v)} title="Розсилка"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: 0 }}>📣</button>
        </div>
        {convs.map(c => (
          <div key={c.id} onClick={() => setActive(c)}
               style={{
                 padding: '12px 16px', cursor: 'pointer',
                 background: active?.id === c.id ? 'var(--bg3)' : 'transparent',
                 borderBottom: '1px solid var(--border)',
               }}>
            <div style={{ fontWeight: 500 }}>
              {convLabel(c)}
              {convBotBlocked(c) && <span title="Заблокував бота" style={{ marginLeft: 4, fontSize: 12 }}>🚫</span>}
            </div>
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

      {broadcastOpen && <BroadcastPanel onClose={() => setBroadcastOpen(false)} />}

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
