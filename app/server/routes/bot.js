const express = require('express');
const { query, one, all } = require('../db');

const router = express.Router();

// POST /api/bot/webhook — receives updates from Telegram
router.post('/webhook', async (req, res) => {
  // Always respond immediately to Telegram
  res.json({ ok: true });

  try {
    const update = req.body;
    const msg = update.message;
    if (!msg || !msg.from || msg.from.is_bot) return;

    const tgUser = msg.from;
    const text = (msg.text || '').trim();
    const caption = (msg.caption || '').trim();
    const content = text || caption;
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

    // Don't create self-conversations for admin/manager (they use the app directly)
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

    // Save message text
    const messageText = content || (msg.photo ? '[photo]' : msg.video ? '[video]' : '[file]');
    const savedMsg = await one(
      `INSERT INTO messages (conversation_id, sender_id, text)
       VALUES ($1, $2, $3) RETURNING *`,
      [conv.id, user.id, messageText]
    );

    await query('UPDATE conversations SET last_message_at = NOW() WHERE id = $1', [conv.id]);

    // Push via SSE to any open app sessions
    const { sseClients } = require('../sse');
    sseClients.push(conv.id, {
      type: 'message',
      message: { ...savedMsg, sender_name: user.name, sender_role: user.role },
    });

  } catch (err) {
    console.error('[bot webhook]', err.message);
  }
});

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
