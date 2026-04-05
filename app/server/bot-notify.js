const https = require('https');

const BOT_TOKEN = process.env.BOT_TOKEN;
const BOOKING_CHAT_ID = process.env.TG_BOOKING_CHAT_ID;
const APKA_CHAT_ID = process.env.TG_APKA_CHAT_ID;
const XAI_API_KEY = process.env.XAI_API_KEY;

function tgPost(method, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve(JSON.parse(raw)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Load last N messages from a conversation with sender names
async function loadHistory(convId, limit = 30) {
  const { all } = require('./db');
  return all(
    `SELECT m.text, m.created_at, u.role, u.name
     FROM messages m JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = $1 AND m.text IS NOT NULL AND m.text <> ''
     ORDER BY m.created_at DESC LIMIT $2`,
    [convId, limit]
  ).then(rows => rows.reverse());
}

// Format conversation tail up to ~3900 chars
// Last message always complete; fill backwards, partial first message gets "..." prefix
function formatHistoryTail(messages, isManagerRole) {
  const LIMIT = 3900;
  const lines = messages.map(m => {
    const isManager = isManagerRole(m.role);
    const arrow = isManager ? '▶' : '◀';
    const text = (m.text || '').replace(/\n{3,}/g, '\n\n').trim();
    return `${m.name} ${arrow} ${text}`;
  }).filter(l => l);

  if (lines.length === 0) return '';

  let body = lines[lines.length - 1];
  for (let i = lines.length - 2; i >= 0; i--) {
    const candidate = lines[i] + '\n\n' + body;
    if (candidate.length <= LIMIT) {
      body = candidate;
    } else {
      const room = LIMIT - '\n\n'.length - body.length - 3;
      if (room > 10) body = '...' + lines[i].slice(lines[i].length - room) + '\n\n' + body;
      break;
    }
  }
  return body;
}

// Generate AI draft reply using Grok
async function generateAiDraft(convId, senderName) {
  if (!XAI_API_KEY) return null;
  try {
    const history = await loadHistory(convId, 10);
    const historyText = history.map(m => {
      const who = (m.role === 'admin' || m.role === 'manager') ? 'Менеджер' : m.name;
      return `${who}: ${m.text}`;
    }).join('\n');

    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${XAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'grok-3-mini',
        messages: [
          {
            role: 'system',
            content: 'Ти менеджер букінг агентства фотомоделей Lambertain. Відповідай коротко, по суті, на мові клієнта (українська, російська або англійська). Без зайвих формальностей.',
          },
          {
            role: 'user',
            content: `Контекст діалогу:\n${historyText}\n\nНапиши відповідь менеджера на останнє повідомлення.`,
          },
        ],
        max_tokens: 400,
      }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error('[AI draft]', err.message);
    return null;
  }
}

// Send history message (no buttons) + draft message (with buttons) to a chat
async function sendHistoryAndDraft(chatId, header, historyBody, draft, msgId, callbackPrefix) {
  // Message 1: header + history
  const historyText = header + (historyBody ? '\n\n' + historyBody : '');
  try {
    await tgPost('sendMessage', { chat_id: chatId, text: historyText });
  } catch (e) {
    console.error('[notify] history send failed:', e.message);
  }

  if (!draft) return;

  // Message 2: draft + buttons
  try {
    await tgPost('sendMessage', {
      chat_id: chatId,
      text: `🤖 Чернетка відповіді:\n${draft}`,
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Відправити', callback_data: `${callbackPrefix}_ok:${msgId}` },
          { text: '✏️ Редагувати', callback_data: `${callbackPrefix}_edit:${msgId}` },
          { text: '⏭ Пропустити', callback_data: `${callbackPrefix}_skip:${msgId}` },
        ]],
      },
    });
  } catch (e) {
    console.error('[notify] draft send failed:', e.message);
  }
}

// Forward app message to user in Telegram (if they have telegram_id)
async function forwardToTelegram(recipientId, senderName, text, mediaFileId, mediaType, mediaName) {
  if (!BOT_TOKEN) return;
  try {
    const { one } = require('./db');
    const recipient = await one('SELECT telegram_id FROM users WHERE id = $1', [recipientId]);
    if (!recipient?.telegram_id) return;

    if (mediaFileId) {
      const method = mediaType === 'image' ? 'sendPhoto' : mediaType === 'video' ? 'sendVideo' : 'sendDocument';
      const field  = mediaType === 'image' ? 'photo'  : mediaType === 'video' ? 'video'  : 'document';
      const caption = text && text !== mediaName
        ? `💬 <b>${senderName}</b>:\n${text}`
        : `💬 <b>${senderName}</b>`;
      await tgPost(method, { chat_id: recipient.telegram_id, [field]: mediaFileId, caption, parse_mode: 'HTML' });
    } else {
      await tgPost('sendMessage', {
        chat_id: recipient.telegram_id,
        text: `💬 <b>${senderName}</b>:\n${text}`,
        parse_mode: 'HTML',
      });
    }
  } catch {}
}

// New message from client/model in mini app → send to appropriate Telegram chat
async function notifyNewMessage(conv, msg, sender) {
  if (!BOT_TOKEN) return;

  const { query } = require('./db');

  if (conv.type === 'model_internal') {
    // Model wrote to manager → БУКИНГ: history + AI draft with buttons
    if (!BOOKING_CHAT_ID) return;

    // If media — send file first
    if (msg.media_file_id) {
      const method = msg.media_type === 'image' ? 'sendPhoto' : msg.media_type === 'video' ? 'sendVideo' : 'sendDocument';
      const field  = msg.media_type === 'image' ? 'photo' : msg.media_type === 'video' ? 'video' : 'document';
      const caption = `📱 <b>${sender.name}</b>${msg.text && msg.text !== msg.media_name ? ':\n' + msg.text : ''}`;
      await tgPost(method, { chat_id: BOOKING_CHAT_ID, [field]: msg.media_file_id, caption, parse_mode: 'HTML' });
    }

    const history = await loadHistory(conv.id, 30);
    const historyBody = formatHistoryTail(history, role => role === 'admin' || role === 'manager');
    const header = `📱 <b>${sender.name}</b> — апка`;

    const draft = await generateAiDraft(conv.id, sender.name);
    if (draft) {
      await query('UPDATE messages SET ai_draft = $1 WHERE id = $2', [draft, msg.id]);
    }

    await sendHistoryAndDraft(BOOKING_CHAT_ID, header, historyBody, draft, msg.id, 'apka');

  } else if (conv.type === 'client_support') {
    // Client/user wrote → АПКА: history + AI draft with buttons
    if (!APKA_CHAT_ID) return;

    // If media — send file first
    if (msg.media_file_id) {
      const method = msg.media_type === 'image' ? 'sendPhoto' : msg.media_type === 'video' ? 'sendVideo' : 'sendDocument';
      const field  = msg.media_type === 'image' ? 'photo' : msg.media_type === 'video' ? 'video' : 'document';
      const caption = `💬 <b>${sender.name}</b>${msg.text && msg.text !== msg.media_name ? ':\n' + msg.text : ''}\n\n<i>conv_id: ${conv.id} | msg_id: ${msg.id}</i>`;
      await tgPost(method, { chat_id: APKA_CHAT_ID, [field]: msg.media_file_id, caption, parse_mode: 'HTML' });
    }

    const history = await loadHistory(conv.id, 30);
    const historyBody = formatHistoryTail(history, role => role === 'admin' || role === 'manager');
    const header = `💬 <b>${sender.name}</b>\n<i>conv_id: ${conv.id} | msg_id: ${msg.id}</i>`;

    const draft = await generateAiDraft(conv.id, sender.name);
    if (draft) {
      await query('UPDATE messages SET ai_draft = $1 WHERE id = $2', [draft, msg.id]);
    }

    // Save tg_message_id on history message for reference
    const histResult = await tgPost('sendMessage', {
      chat_id: APKA_CHAT_ID,
      text: header + (historyBody ? '\n\n' + historyBody : ''),
      parse_mode: 'HTML',
    });
    if (histResult?.ok) {
      await query('UPDATE messages SET tg_message_id = $1 WHERE id = $2', [histResult.result.message_id, msg.id]);
    }

    if (draft) {
      await tgPost('sendMessage', {
        chat_id: APKA_CHAT_ID,
        text: `🤖 Чернетка відповіді:\n${draft}`,
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Відправити', callback_data: `apka_ok:${msg.id}` },
            { text: '✏️ Редагувати', callback_data: `apka_edit:${msg.id}` },
            { text: '⏭ Пропустити', callback_data: `apka_skip:${msg.id}` },
          ]],
        },
      });
    }
  }
}

// Send approved reply back to conversation (called from bot webhook after approve)
async function deliverApprovedReply(convId, text, approverId) {
  const { one, query } = require('./db');

  const conv = await one('SELECT * FROM conversations WHERE id = $1', [convId]);
  if (!conv) throw new Error(`Conv ${convId} not found`);

  const sender = await one('SELECT id FROM users WHERE id = $1', [approverId]);
  const senderId = sender?.id || approverId;

  const msg = await one(
    `INSERT INTO messages (conversation_id, sender_id, text, approved_at)
     VALUES ($1,$2,$3,NOW()) RETURNING *`,
    [convId, senderId, text]
  );

  await query('UPDATE conversations SET last_message_at = NOW() WHERE id = $1', [convId]);

  // Push via SSE
  const { sseClients } = require('./sse');
  sseClients.push(convId, { type: 'message', message: msg });

  return msg;
}

module.exports = { notifyNewMessage, deliverApprovedReply, forwardToTelegram };
