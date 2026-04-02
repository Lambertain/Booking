const express = require('express');
const { one, all, query } = require('../db');

const router = express.Router();

function requireSyncSecret(req, res, next) {
  const secret = (req.headers.authorization || '').replace('Bearer ', '');
  if (!secret || secret !== process.env.SYNC_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// POST /api/sync/shoot — called by booking bot on Windows Server
router.post('/shoot', async (req, res) => {
  try {
    const secret = (req.headers.authorization || '').replace('Bearer ', '');
    if (!secret || secret !== process.env.SYNC_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { modelSlug, photographerName, photographerSite, photographerEmail,
            photographerPhone, photographerTelegram, dialogUrl,
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
      `INSERT INTO shoots (model_id, photographer_name, photographer_site,
        photographer_email, photographer_phone, photographer_telegram,
        dialog_url, shoot_date, location, rate, currency, status, notes, synced_from_bot_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
       RETURNING *`,
      [modelRow.id, photographerName, photographerSite || null,
       photographerEmail || null, photographerPhone || null, photographerTelegram || null,
       dialogUrl || null, shootDate || null, location || null,
       rate || null, currency || 'EUR', status || 'negotiating', notes || null]
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

// POST /api/sync/delivery — log delivery result from booking bot
router.post('/delivery', requireSyncSecret, async (req, res) => {
  try {
    const { modelSlug, modelName, photographer, site, status, error } = req.body;
    if (!modelSlug || !photographer || !site || !status) {
      return res.status(400).json({ error: 'modelSlug, photographer, site, status required' });
    }
    if (!['sent', 'failed'].includes(status)) {
      return res.status(400).json({ error: 'status must be sent or failed' });
    }
    await query(
      `INSERT INTO delivery_log (model_slug, model_name, photographer, site, status, error_message)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [modelSlug, modelName || null, photographer, site, status, error || null]
    );
    console.log(`[sync/delivery] ${status}: ${photographer} (${site}) → ${modelSlug}`);
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[sync/delivery] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sync/pipeline — log pipeline scan stats from booking bot
router.post('/pipeline', requireSyncSecret, async (req, res) => {
  try {
    const { modelSlug, modelName, totalSeen, totalQueued, totalUninterested } = req.body;
    if (!modelSlug) {
      return res.status(400).json({ error: 'modelSlug required' });
    }
    await query(
      `INSERT INTO pipeline_stats (model_slug, model_name, total_seen, total_queued, total_uninterested)
       VALUES ($1, $2, $3, $4, $5)`,
      [modelSlug, modelName || null, totalSeen || 0, totalQueued || 0, totalUninterested || 0]
    );
    console.log(`[sync/pipeline] ${modelSlug}: seen=${totalSeen}, queued=${totalQueued}, uninterested=${totalUninterested}`);
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[sync/pipeline] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
