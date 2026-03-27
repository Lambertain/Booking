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
    const { name, content, sites } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const row = await one(
      `INSERT INTO mailing_templates (name, content, sites, created_by)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, content || null, sites || null, req.user.id]
    );
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/templates/:id
router.patch('/:id', requireAuth('admin', 'manager'), async (req, res) => {
  try {
    const { name, content, sites } = req.body;
    const updates = [];
    const vals = [];
    let i = 1;
    if (name !== undefined)    { updates.push(`name = $${i++}`);    vals.push(name); }
    if (content !== undefined) { updates.push(`content = $${i++}`); vals.push(content); }
    if (sites !== undefined)   { updates.push(`sites = $${i++}`);   vals.push(sites); }
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
