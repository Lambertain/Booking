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
            shootDate, location, rate, currency, notes } = req.body;

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
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'confirmed',$9,NOW())
       RETURNING *`,
      [modelRow.id, photographerName, photographerSite || null, dialogUrl || null,
       shootDate || null, location || null, rate || null, currency || 'EUR', notes || null]
    );

    console.log(`[sync] Shoot created: ${photographerName} → model ${modelSlug} (id ${shoot.id})`);
    res.status(201).json({ ok: true, shootId: shoot.id });
  } catch (err) {
    console.error('[sync] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
