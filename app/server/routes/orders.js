const express = require('express');
const { one, all, query } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// GET /api/orders/clients — list potential clients for order form
router.get('/clients', requireAuth('admin', 'manager'), async (req, res) => {
  try {
    const rows = await all(
      `SELECT u.id as user_id, u.name, u.telegram_username,
              c.id as client_id, c.company_name
       FROM users u
       LEFT JOIN clients c ON c.user_id = u.id
       WHERE u.role IN ('client', 'user') AND u.is_active = TRUE
       ORDER BY u.name`,
      []
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders
router.get('/', requireAuth('admin', 'manager', 'client'), async (req, res) => {
  try {
    const { role, id } = req.user;
    let rows;
    if (role === 'client') {
      rows = await all(
        `SELECT o.*, u.name as client_name FROM mailing_orders o
         LEFT JOIN clients c ON c.id = o.client_id
         LEFT JOIN users u ON u.id = c.user_id
         WHERE c.user_id = $1 ORDER BY o.created_at DESC`,
        [id]
      );
    } else {
      rows = await all(
        `SELECT o.*, u.name as client_name FROM mailing_orders o
         LEFT JOIN clients c ON c.id = o.client_id
         LEFT JOIN users u ON u.id = c.user_id
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
      // manager/admin: accept client_id (clients.id) or user_id (users.id)
      if (req.body.client_id) {
        clientId = req.body.client_id;
      } else if (req.body.user_id) {
        // auto-create client record if missing
        let c = await one('SELECT id FROM clients WHERE user_id = $1', [req.body.user_id]);
        if (!c) {
          c = await one('INSERT INTO clients (user_id) VALUES ($1) RETURNING id', [req.body.user_id]);
          await query(`UPDATE users SET role = 'client' WHERE id = $1 AND role = 'user'`, [req.body.user_id]);
        }
        clientId = c.id;
      } else {
        return res.status(400).json({ error: 'client_id or user_id required' });
      }
    }

    const { sites, regions, volume, price, notes, order_type, rental_start, rental_end } = req.body;
    const row = await one(
      `INSERT INTO mailing_orders (client_id, target_sites, target_regions, volume, price, notes, order_type, rental_start, rental_end)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [clientId, sites || null, regions || null, volume || null, price || null,
       notes || null, order_type || 'rent', rental_start || null, rental_end || null]
    );
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/orders/:id
router.patch('/:id', requireAuth('admin', 'manager'), async (req, res) => {
  try {
    const { status, notes, order_type, rental_start, rental_end } = req.body;
    const updates = [];
    const vals = [];
    let i = 1;
    if (status !== undefined)       { updates.push(`status = $${i++}`);       vals.push(status); }
    if (notes !== undefined)        { updates.push(`notes = $${i++}`);        vals.push(notes); }
    if (order_type !== undefined)   { updates.push(`order_type = $${i++}`);   vals.push(order_type); }
    if (rental_start !== undefined) { updates.push(`rental_start = $${i++}`); vals.push(rental_start); }
    if (rental_end !== undefined)   { updates.push(`rental_end = $${i++}`);   vals.push(rental_end); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    vals.push(req.params.id);
    const row = await one(`UPDATE mailing_orders SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`, vals);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
