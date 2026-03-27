const express = require('express');
const { one, all } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// GET /api/templates
router.get('/', requireAuth('admin', 'manager', 'client'), async (req, res) => {
  try {
    const rows = await all('SELECT * FROM mailing_templates ORDER BY created_at DESC', []);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/templates
router.post('/', requireAuth('admin', 'manager'), async (req, res) => {
  try {
    const { name, rental_start, rental_end } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const row = await one(
      `INSERT INTO mailing_templates (name, created_by, rental_start, rental_end)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, req.user.id, rental_start || null, rental_end || null]
    );
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/templates/:id
router.patch('/:id', requireAuth('admin', 'manager'), async (req, res) => {
  try {
    const { name, rental_start, rental_end } = req.body;
    const updates = [];
    const vals = [];
    let i = 1;
    if (name !== undefined)         { updates.push(`name = $${i++}`);         vals.push(name); }
    if (rental_start !== undefined) { updates.push(`rental_start = $${i++}`); vals.push(rental_start); }
    if (rental_end !== undefined)   { updates.push(`rental_end = $${i++}`);   vals.push(rental_end); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    vals.push(req.params.id);
    const row = await one(`UPDATE mailing_templates SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`, vals);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/templates/:id
router.delete('/:id', requireAuth('admin', 'manager'), async (req, res) => {
  try {
    await one('DELETE FROM mailing_templates WHERE id = $1 RETURNING id', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
