const express = require('express');
const { query, one, all } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// GET /api/conversations — list my conversations
router.get('/', requireAuth(), async (req, res) => {
  try {
    const { id, role } = req.user;
    let rows;
    const subJoin = `
      LEFT JOIN subscribers sa ON sa.telegram_id = ua.telegram_id::text
      LEFT JOIN subscribers sb ON sb.telegram_id = ub.telegram_id::text`;
    const subSelect = `sa.status as participant_a_sub_status, sb.status as participant_b_sub_status,`;
    if (role === 'admin' || role === 'manager') {
      rows = await all(
        `SELECT c.*, ${subSelect}
           ua.name as participant_a_name, ua.role as participant_a_role,
           ub.name as participant_b_name, ub.role as participant_b_role,
           (SELECT text FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
           (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND is_read = FALSE AND sender_id != $1) as unread
         FROM conversations c
         JOIN users ua ON ua.id = c.participant_a
         JOIN users ub ON ub.id = c.participant_b
         ${subJoin}
         ORDER BY c.last_message_at DESC NULLS LAST`,
        [id]
      );
    } else {
      rows = await all(
        `SELECT c.*, ${subSelect}
           ua.name as participant_a_name, ua.role as participant_a_role,
           ub.name as participant_b_name, ub.role as participant_b_role,
           (SELECT text FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
           (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND is_read = FALSE AND sender_id != $1) as unread
         FROM conversations c
         JOIN users ua ON ua.id = c.participant_a
         JOIN users ub ON ub.id = c.participant_b
         ${subJoin}
         WHERE c.participant_a = $1 OR c.participant_b = $1
         ORDER BY c.last_message_at DESC NULLS LAST`,
        [id]
      );
    }
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/conversations/:id/messages
router.get('/:id/messages', requireAuth(), async (req, res) => {
  try {
    const conv = await one('SELECT * FROM conversations WHERE id = $1', [req.params.id]);
    if (!conv) return res.status(404).json({ error: 'Not found' });

    const { id: userId, role } = req.user;
    if (role !== 'admin' && role !== 'manager' &&
        conv.participant_a !== userId && conv.participant_b !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const messages = await all(
      `SELECT m.*, u.name as sender_name, u.role as sender_role
       FROM messages m JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = $1 ORDER BY m.created_at ASC`,
      [req.params.id]
    );

    // Mark as read
    await query(
      `UPDATE messages SET is_read = TRUE WHERE conversation_id = $1 AND sender_id != $2`,
      [req.params.id, userId]
    );

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/conversations/:id/messages — send message
router.post('/:id/messages', requireAuth(), async (req, res) => {
  try {
    const { text, media_url, media_type, media_name, media_file_id } = req.body;
    if ((!text || !text.trim()) && !media_url) return res.status(400).json({ error: 'text or media required' });

    const conv = await one('SELECT * FROM conversations WHERE id = $1', [req.params.id]);
    if (!conv) return res.status(404).json({ error: 'Not found' });

    const { id: userId, role } = req.user;
    if (role !== 'admin' && role !== 'manager' &&
        conv.participant_a !== userId && conv.participant_b !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const msg = await one(
      `INSERT INTO messages (conversation_id, sender_id, text, media_url, media_type, media_name, media_file_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [conv.id, userId, (text || '').trim(), media_url || null, media_type || null, media_name || null, media_file_id || null]
    );

    await query(
      `UPDATE conversations SET last_message_at = NOW() WHERE id = $1`,
      [conv.id]
    );

    const { notifyNewMessage, forwardToTelegram } = require('../bot-notify');

    if (role === 'model' || role === 'client' || role === 'user') {
      // User-side message → notify managers in Telegram
      notifyNewMessage(conv, msg, req.user).catch(() => {});
    } else {
      // Manager/admin reply → forward to the other participant in Telegram
      const recipientId = conv.participant_a === userId ? conv.participant_b : conv.participant_a;
      forwardToTelegram(recipientId, req.user.name, text?.trim() || '', media_file_id, media_type, media_name).catch(() => {});
    }

    // Push via SSE so recipient sees the message in real-time
    const { sseClients } = require('../sse');
    const sender = await one('SELECT name, role FROM users WHERE id = $1', [userId]);
    sseClients.push(conv.id, { type: 'message', message: { ...msg, sender_name: sender?.name, sender_role: sender?.role } });

    res.status(201).json(msg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/conversations/:id/events — SSE stream
router.get('/:id/events', requireAuth(), async (req, res) => {
  const convId = parseInt(req.params.id);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const { sseClients } = require('../sse');
  sseClients.add(convId, res);

  req.on('close', () => {
    sseClients.remove(convId, res);
  });
});

// POST /api/conversations/with-manager — find or create conversation with first available manager/admin
router.post('/with-manager', requireAuth('model', 'client', 'user'), async (req, res) => {
  try {
    const userId = req.user.id;
    const convType = req.user.role === 'model' ? 'model_internal' : 'client_support';

    // Find an admin/manager user (prefer assigned manager for model, otherwise first admin)
    let manager = null;
    if (req.user.role === 'model') {
      manager = await one(
        `SELECT u.id FROM users u
         JOIN manager_models mm ON mm.manager_id = u.id
         JOIN agency_models am ON am.user_id = $1 AND am.id = mm.model_id
         WHERE u.is_active = TRUE LIMIT 1`,
        [userId]
      );
    }
    if (!manager) {
      manager = await one(
        `SELECT id FROM users WHERE role IN ('admin','manager') AND is_active = TRUE ORDER BY role DESC LIMIT 1`,
        []
      );
    }
    if (!manager) return res.status(404).json({ error: 'No manager available' });

    const a = Math.min(userId, manager.id);
    const b = Math.max(userId, manager.id);
    let conv = await one(
      `SELECT * FROM conversations WHERE LEAST(participant_a, participant_b) = $1
       AND GREATEST(participant_a, participant_b) = $2`,
      [a, b]
    );
    if (!conv) {
      conv = await one(
        `INSERT INTO conversations (type, participant_a, participant_b) VALUES ($1,$2,$3) RETURNING *`,
        [convType, userId, manager.id]
      );
    }
    res.json(conv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/conversations — create or get existing
router.post('/', requireAuth('admin', 'manager', 'model', 'client', 'user'), async (req, res) => {
  try {
    const { participant_a, participant_b, type } = req.body;
    const a = Math.min(participant_a, participant_b);
    const b = Math.max(participant_a, participant_b);

    let conv = await one(
      `SELECT * FROM conversations WHERE LEAST(participant_a, participant_b) = $1
       AND GREATEST(participant_a, participant_b) = $2 AND type = $3`,
      [a, b, type]
    );

    if (!conv) {
      conv = await one(
        `INSERT INTO conversations (type, participant_a, participant_b)
         VALUES ($1, $2, $3) RETURNING *`,
        [type, participant_a, participant_b]
      );
    }

    res.json(conv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
