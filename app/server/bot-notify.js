const https = require('https');

const BOT_TOKEN = process.env.BOT_TOKEN;
const BOOKING_CHAT_ID = process.env.TG_BOOKING_CHAT_ID;
const APKA_CHAT_ID = process.env.TG_APKA_CHAT_ID;

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

// Forward app message to user in Telegram (if they have telegram_id)
async function forwardToTelegram(recipientId, senderName, text) {
  if (!BOT_TOKEN) return;
  try {
    const { one } = require('./db');
    const recipient = await one('SELECT telegram_id FROM users WHERE id = $1', [recipientId]);
    if (!recipient?.telegram_id) return;
    await tgPost('sendMessage', {
      chat_id: recipient.telegram_id,
      text: `💬 <b>${senderName}</b>:\n${text}`,
      parse_mode: 'HTML',
    });
  } catch {}
}

// New message from client/model in mini app → send to appropriate Telegram chat
async function notifyNewMessage(conv, msg, sender) {
  if (!BOT_TOKEN) return;

  if (conv.type === 'model_internal') {
    // Model wrote to manager → notification in БУКИНГ (no approval needed)
    if (!BOOKING_CHAT_ID) return;
    const text = `📱 <b>${sender.name}</b> написала в апці:\n${msg.text}`;
    await tgPost('sendMessage', {
      chat_id: BOOKING_CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_notification: false,
    });
  } else if (conv.type === 'client_support') {
    // Client wrote → send to АПКА for AI approval
    if (!APKA_CHAT_ID) return;
    const text = `💬 <b>Клієнт ${sender.name}</b> написав:\n${msg.text}\n\n<i>conv_id: ${conv.id} | msg_id: ${msg.id}</i>`;
    const result = await tgPost('sendMessage', {
      chat_id: APKA_CHAT_ID,
      text,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Відправити', callback_data: `apka_ok:${msg.id}` },
          { text: '✏️ Редагувати', callback_data: `apka_edit:${msg.id}` },
          { text: '⏭ Пропустити', callback_data: `apka_skip:${msg.id}` },
        ]],
      },
    });
    // Store tg_message_id for later reference
    if (result.ok) {
      const { query } = require('./db');
      await query('UPDATE messages SET tg_message_id = $1 WHERE id = $2',
        [result.result.message_id, msg.id]);
    }
  }
}

// Send approved reply back to conversation (called from booking bot after approve)
async function deliverApprovedReply(convId, text, approverId) {
  const { one, query } = require('./db');

  const conv = await one('SELECT * FROM conversations WHERE id = $1', [convId]);
  if (!conv) throw new Error(`Conv ${convId} not found`);

  // Find admin/manager to be the sender
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

module.exports = { notifyNewMessage, deliverApprovedReply };
