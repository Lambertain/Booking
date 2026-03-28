const express = require('express');
const { one, all } = require('../db');

const router = express.Router();

// POST /api/sync/shoot — called by booking bot on Windows Server
router.post('/shoot', async (req, res) => {
  try {
    const secret = (req.headers.authorization || '').replace('Bearer ', '');
    if (!secret || secret !== process.env.SYNC_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { modelSlug, photographerName, photographerSite, dialogUrl,
            shootDate, location, rate, currency, notes, status } = req.body;

    if (!modelSlug || !photographerName) {
      return res.status(400).json({ error: 'modelSlug and photographerName required' });
    }

    // Find model by slug
    const modelRow = await one(
      `SELECT u.id FROM users u JOIN agency_models am ON am.user_id = u.id WHERE am.slug = $1`,
      [modelSlug]
    );
    if (!modelRow) return res.status(404).json({ error: `Model not found: ${modelSlug}` });

    const shoot = await one(
      `INSERT INTO shoots (model_id, photographer_name, photographer_site, dialog_url,
        shoot_date, location, rate, currency, status, notes, synced_from_bot_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
       RETURNING *`,
      [modelRow.id, photographerName, photographerSite || null, dialogUrl || null,
       shootDate || null, location || null, rate || null, currency || 'EUR',
       status || 'negotiating', notes || null]
    );

    console.log(`[sync] Shoot created: ${photographerName} → model ${modelSlug} (id ${shoot.id})`);
    res.status(201).json({ ok: true, shootId: shoot.id });
  } catch (err) {
    console.error('[sync] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sync/deliver-reply — called by booking bot to deliver approved reply from АПКА
router.post('/deliver-reply', async (req, res) => {
  try {
    const secret = (req.headers.authorization || '').replace('Bearer ', '');
    if (!secret || secret !== process.env.SYNC_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { msgId, text, approverId } = req.body;
    if (!msgId || !text) return res.status(400).json({ error: 'msgId and text required' });

    const { deliverApprovedReply, forwardToTelegram } = require('../bot-notify');
    const { one } = require('../db');

    const userMsg = await one('SELECT * FROM messages WHERE id = $1', [msgId]);
    if (!userMsg) return res.status(404).json({ error: 'Message not found' });

    const conv = await one('SELECT * FROM conversations WHERE id = $1', [userMsg.conversation_id]);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    const approver = approverId
      ? await one('SELECT * FROM users WHERE id = $1', [approverId]).catch(() => null)
      : null;

    const replyMsg = await deliverApprovedReply(conv.id, text, approver?.id || 1);

    // Forward to recipient's Telegram DM if they have telegram_id
    const recipientId = conv.participant_a === (approver?.id || 1) ? conv.participant_b : conv.participant_a;
    forwardToTelegram(recipientId, approver?.name || 'Менеджер', text).catch(() => {});

    res.json({ ok: true, messageId: replyMsg.id });
  } catch (err) {
    console.error('[sync/deliver-reply] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sync/ai-draft/:msgId — get AI draft for a message
router.get('/ai-draft/:msgId', async (req, res) => {
  try {
    const secret = (req.headers.authorization || '').replace('Bearer ', '');
    if (!secret || secret !== process.env.SYNC_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const row = await one('SELECT ai_draft FROM messages WHERE id = $1', [req.params.msgId]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ ai_draft: row.ai_draft });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
