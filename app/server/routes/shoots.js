const express = require('express');
const { query, one, all } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// GET /api/shoots — list (filtered by role)
router.get('/', requireAuth('admin', 'manager', 'model'), async (req, res) => {
  try {
    const { user } = req;
    let sql, params;

    if (user.role === 'model') {
      sql = `SELECT s.*, u.name as model_name FROM shoots s
             JOIN users u ON u.id = s.model_id
             WHERE s.model_id = $1 ORDER BY s.created_at DESC`;
      params = [user.id];
    } else if (user.role === 'manager') {
      sql = `SELECT s.*, u.name as model_name FROM shoots s
             JOIN users u ON u.id = s.model_id
             JOIN manager_models mm ON mm.model_id = s.model_id
             WHERE mm.manager_id = $1 ORDER BY s.created_at DESC`;
      params = [user.id];
    } else {
      sql = `SELECT s.*, u.name as model_name FROM shoots s
             JOIN users u ON u.id = s.model_id
             ORDER BY s.created_at DESC`;
      params = [];
    }

    const rows = await all(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/shoots/:id
router.get('/:id', requireAuth('admin', 'manager', 'model'), async (req, res) => {
  try {
    const shoot = await one(
      `SELECT s.*, u.name as model_name FROM shoots s JOIN users u ON u.id = s.model_id WHERE s.id = $1`,
      [req.params.id]
    );
    if (!shoot) return res.status(404).json({ error: 'Not found' });
    res.json(shoot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shoots
router.post('/', requireAuth('admin', 'manager'), async (req, res) => {
  try {
    const { model_id, photographer_name, photographer_site, dialog_url,
            shoot_date, location, rate, currency, status, notes } = req.body;
    const row = await one(
      `INSERT INTO shoots (model_id, photographer_name, photographer_site, dialog_url,
        shoot_date, location, rate, currency, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [model_id, photographer_name, photographer_site, dialog_url,
       shoot_date || null, location, rate || null, currency || 'EUR', status || 'negotiating', notes]
    );
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/shoots/:id
router.patch('/:id', requireAuth('admin', 'manager'), async (req, res) => {
  try {
    const fields = ['photographer_name','photographer_site','dialog_url','shoot_date',
                    'location','rate','currency','status','notes',
                    'photographer_email','photographer_phone','photographer_telegram'];
    const updates = [];
    const vals = [];
    let i = 1;
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = $${i++}`);
        vals.push(req.body[f]);
      }
    }
    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });
    vals.push(req.params.id);
    const row = await one(
      `UPDATE shoots SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
      vals
    );
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/shoots/:id (admin only)
router.delete('/:id', requireAuth('admin'), async (req, res) => {
  try {
    await query('DELETE FROM shoots WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
