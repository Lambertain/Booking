const express = require('express');
const { one, all, query } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// GET /api/orders
router.get('/', requireAuth('admin', 'manager', 'client'), async (req, res) => {
  try {
    const { role, id } = req.user;
    let rows;
    if (role === 'client') {
      rows = await all(
        `SELECT o.*, u.name as client_name FROM mailing_orders o
         JOIN clients c ON c.id = o.client_id
         JOIN users u ON u.id = c.user_id
         WHERE c.user_id = $1 ORDER BY o.created_at DESC`,
        [id]
      );
    } else {
      rows = await all(
        `SELECT o.*, u.name as client_name FROM mailing_orders o
         JOIN clients c ON c.id = o.client_id
         JOIN users u ON u.id = c.user_id
         ORDER BY o.created_at DESC`,
        []
      );
    }
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders
router.post('/', requireAuth('admin', 'manager', 'client'), async (req, res) => {
  try {
    const { role, id } = req.user;
    let clientId;
    if (role === 'client') {
      const c = await one('SELECT id FROM clients WHERE user_id = $1', [id]);
      if (!c) return res.status(400).json({ error: 'Client profile not found' });
      clientId = c.id;
    } else {
      // manager/admin can specify client_id
      clientId = req.body.client_id;
      if (!clientId) return res.status(400).json({ error: 'client_id required' });
    }

    const { sites, regions, genres, volume, price, notes } = req.body;
    const row = await one(
      `INSERT INTO mailing_orders (client_id, target_sites, target_regions, target_genres, volume, price, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [clientId, sites || null, regions || null, genres || null, volume || null, price || null, notes || null]
    );
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/orders/:id
router.patch('/:id', requireAuth('admin', 'manager'), async (req, res) => {
  try {
    const { status, notes } = req.body;
    const updates = [];
    const vals = [];
    let i = 1;
    if (status !== undefined) { updates.push(`status = $${i++}`); vals.push(status); }
    if (notes !== undefined)  { updates.push(`notes = $${i++}`);  vals.push(notes); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    vals.push(req.params.id);
    const row = await one(`UPDATE mailing_orders SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`, vals);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
