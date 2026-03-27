const express = require('express');
const { query, one, all } = require('../db');

const router = express.Router();

// In-memory state for pending edits: tgChatId → { msgId }
const pendingEdits = new Map();

const BOOKING_CHAT_ID = process.env.TG_BOOKING_CHAT_ID;

// Forward БУКИНГ updates to Windows Server booking bot
async function forwardToBookingBot(update) {
  const botWebhookUrl = process.env.BOT_WEBHOOK_URL; // e.g. http://185.203.242.10:3456/update
  if (!botWebhookUrl) return false;
  try {
    const res = await fetch(botWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function isBookingUpdate(update) {
  const chatId = String(
    update.message?.chat?.id ||
    update.callback_query?.message?.chat?.id || ''
  );
  return chatId === String(BOOKING_CHAT_ID);
}

// POST /api/bot/webhook — receives updates from Telegram
router.post('/webhook', async (req, res) => {
  // Always respond immediately to Telegram
  res.json({ ok: true });

  try {
    const update = req.body;

    // Forward БУКИНГ updates to Windows Server booking bot
    if (isBookingUpdate(update)) {
      forwardToBookingBot(update);
      return;
    }

    // --- callback_query (button press) ---
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
      return;
    }

    const msg = update.message;
    if (!msg || !msg.from || msg.from.is_bot) return;

    const tgUser = msg.from;
    const text = (msg.text || '').trim();
    const caption = (msg.caption || '').trim();
    const content = text || caption;

    // Check if manager is editing a draft
    const chatId = String(msg.chat.id);
    if (pendingEdits.has(chatId) && content) {
      await handleEditReply(chatId, content, tgUser);
      return;
    }

    if (!content && !msg.photo && !msg.video && !msg.document) return;

    // Find or create user by telegram_id / username
    let user = await one(
      'SELECT * FROM users WHERE telegram_id = $1 AND is_active = TRUE',
      [String(tgUser.id)]
    ).catch(() => null);

    if (!user && tgUser.username) {
      user = await one(
        'SELECT * FROM users WHERE LOWER(telegram_username) = LOWER($1) AND is_active = TRUE',
        [tgUser.username]
      ).catch(() => null);
      if (user) {
        await query('UPDATE users SET telegram_id = $1 WHERE id = $2', [String(tgUser.id), user.id]);
        user.telegram_id = String(tgUser.id);
      }
    }

    // Auto-create 'user' role account for unknown people
    if (!user) {
      const name = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ')
        || tgUser.username
        || `tg_${tgUser.id}`;
      user = await one(
        `INSERT INTO users (role, name, telegram_id, telegram_username, is_active)
         VALUES ('user', $1, $2, $3, TRUE) RETURNING *`,
        [name, String(tgUser.id), tgUser.username || null]
      );
    }

    // Don't create self-conversations for admin/manager
    if (user.role === 'admin' || user.role === 'manager') return;

    // Find a manager or admin to pair with
    const partner = await one(
      `SELECT id FROM users WHERE role IN ('admin', 'manager') AND is_active = TRUE
       ORDER BY CASE WHEN role = 'manager' THEN 0 ELSE 1 END, id LIMIT 1`
    ).catch(() => null);
    if (!partner) return;

    // Get or create conversation
    const a = Math.min(user.id, partner.id);
    const b = Math.max(user.id, partner.id);
    let conv = await one(
      `SELECT * FROM conversations
       WHERE LEAST(participant_a, participant_b) = $1
         AND GREATEST(participant_a, participant_b) = $2`,
      [a, b]
    ).catch(() => null);

    if (!conv) {
      const convType = user.role === 'model' ? 'model_internal' : 'client_support';
      conv = await one(
        `INSERT INTO conversations (type, participant_a, participant_b)
         VALUES ($1, $2, $3) RETURNING *`,
        [convType, user.id, partner.id]
      );
    }

    const messageText = content || (msg.photo ? '[photo]' : msg.video ? '[video]' : '[file]');
    const savedMsg = await one(
      `INSERT INTO messages (conversation_id, sender_id, text)
       VALUES ($1, $2, $3) RETURNING *`,
      [conv.id, user.id, messageText]
    );

    await query('UPDATE conversations SET last_message_at = NOW() WHERE id = $1', [conv.id]);

    // Push via SSE
    const { sseClients } = require('../sse');
    sseClients.push(conv.id, {
      type: 'message',
      message: { ...savedMsg, sender_name: user.name, sender_role: user.role },
    });

    // Notify АПКА with AI draft
    const { notifyNewMessage } = require('../bot-notify');
    notifyNewMessage(conv, savedMsg, user).catch(e => console.error('[notify]', e.message));

  } catch (err) {
    console.error('[bot webhook]', err.message);
  }
});

async function handleCallbackQuery(cbq) {
  const { tgPost } = getBotHelpers();
  const [action, msgIdStr] = cbq.data.split(':');
  const msgId = parseInt(msgIdStr);
  const tgChatId = String(cbq.message.chat.id);
  const tgMsgId = cbq.message.message_id;
  const approver = cbq.from;

  // Find approver user
  const approverUser = await one(
    'SELECT * FROM users WHERE telegram_id = $1',
    [String(approver.id)]
  ).catch(() => null);

  if (action === 'apka_ok') {
    // Get ai_draft and conv_id from the user message
    const userMsg = await one('SELECT * FROM messages WHERE id = $1', [msgId]).catch(() => null);
    if (!userMsg || !userMsg.ai_draft) {
      await tgPost('answerCallbackQuery', { callback_query_id: cbq.id, text: 'Чернетка не знайдена' });
      return;
    }

    const conv = await one('SELECT * FROM conversations WHERE id = $1', [userMsg.conversation_id]).catch(() => null);
    if (!conv) {
      await tgPost('answerCallbackQuery', { callback_query_id: cbq.id, text: 'Діалог не знайдено' });
      return;
    }

    const { deliverApprovedReply, forwardToTelegram } = require('../bot-notify');
    const approverId = approverUser?.id || 1;
    const replyMsg = await deliverApprovedReply(conv.id, userMsg.ai_draft, approverId);

    // Forward reply to the other participant in Telegram
    const recipientId = conv.participant_a === approverId ? conv.participant_b : conv.participant_a;
    const senderName = approverUser?.name || 'Менеджер';
    forwardToTelegram(recipientId, senderName, userMsg.ai_draft).catch(() => {});

    // Edit the Telegram message to show it was sent
    await tgPost('editMessageReplyMarkup', {
      chat_id: tgChatId,
      message_id: tgMsgId,
      reply_markup: { inline_keyboard: [] },
    });
    await tgPost('answerCallbackQuery', { callback_query_id: cbq.id, text: '✅ Відправлено' });

  } else if (action === 'apka_edit') {
    // Store pending edit state
    pendingEdits.set(tgChatId, { msgId, tgMsgId });
    await tgPost('sendMessage', {
      chat_id: tgChatId,
      text: '✏️ Надішліть відредагований текст відповіді:',
      parse_mode: 'HTML',
    });
    await tgPost('answerCallbackQuery', { callback_query_id: cbq.id, text: 'Введіть текст' });

  } else if (action === 'apka_skip') {
    await tgPost('editMessageReplyMarkup', {
      chat_id: tgChatId,
      message_id: tgMsgId,
      reply_markup: { inline_keyboard: [] },
    });
    await tgPost('answerCallbackQuery', { callback_query_id: cbq.id, text: '⏭ Пропущено' });
  }
}

async function handleEditReply(tgChatId, editedText, tgUser) {
  const { tgPost } = getBotHelpers();
  const pending = pendingEdits.get(tgChatId);
  pendingEdits.delete(tgChatId);

  const userMsg = await one('SELECT * FROM messages WHERE id = $1', [pending.msgId]).catch(() => null);
  if (!userMsg) return;

  const conv = await one('SELECT * FROM conversations WHERE id = $1', [userMsg.conversation_id]).catch(() => null);
  if (!conv) return;

  const approverUser = await one(
    'SELECT * FROM users WHERE telegram_id = $1',
    [String(tgUser.id)]
  ).catch(() => null);
  const approverId = approverUser?.id || 1;

  const { deliverApprovedReply, forwardToTelegram } = require('../bot-notify');
  await deliverApprovedReply(conv.id, editedText, approverId);

  const recipientId = conv.participant_a === approverId ? conv.participant_b : conv.participant_a;
  const senderName = approverUser?.name || 'Менеджер';
  forwardToTelegram(recipientId, senderName, editedText).catch(() => {});

  // Remove buttons from original draft message
  await tgPost('editMessageReplyMarkup', {
    chat_id: tgChatId,
    message_id: pending.tgMsgId,
    reply_markup: { inline_keyboard: [] },
  });
  await tgPost('sendMessage', {
    chat_id: tgChatId,
    text: '✅ Відправлено',
  });
}

// Helper to avoid circular deps
function getBotHelpers() {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  const https = require('https');

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

  return { tgPost };
}

// Register webhook with Telegram
async function registerWebhook(appUrl) {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN || !appUrl) return;
  const webhookUrl = `${appUrl}/api/bot/webhook`;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl, drop_pending_updates: false }),
      }
    );
    const data = await res.json();
    if (data.ok) {
      console.log(`[bot] Webhook registered: ${webhookUrl}`);
    } else {
      console.warn('[bot] Webhook registration failed:', data.description);
    }
  } catch (err) {
    console.warn('[bot] Webhook registration error:', err.message);
  }
}

module.exports = { router, registerWebhook };
