const express = require('express');
const { one, all, query } = require('../db');
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
    const { name, rental_start, rental_end, deal_type } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const row = await one(
      `INSERT INTO mailing_templates (name, created_by, rental_start, rental_end, deal_type)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, req.user.id, rental_start || null, rental_end || null, deal_type || 'rent']
    );
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/templates/:id
router.patch('/:id', requireAuth('admin', 'manager'), async (req, res) => {
  try {
    const {
      name, rental_start, rental_end, deal_step, responsible,
      price, model_sites, accesses, contact_name, contact_email,
      source_type, deal_type, created_by, accounts, deadline,
    } = req.body;
    const updates = [];
    const vals = [];
    let i = 1;
    if (name !== undefined)          { updates.push(`name = $${i++}`);          vals.push(name); }
    if (rental_start !== undefined)  { updates.push(`rental_start = $${i++}`);  vals.push(rental_start || null); }
    if (rental_end !== undefined)    { updates.push(`rental_end = $${i++}`);    vals.push(rental_end || null); }
    if (deal_step !== undefined)     { updates.push(`deal_step = $${i++}`);     vals.push(deal_step); }
    if (responsible !== undefined)   { updates.push(`responsible = $${i++}`);   vals.push(responsible); }
    if (price !== undefined)         { updates.push(`price = $${i++}`);         vals.push(price || null); }
    if (model_sites !== undefined)   { updates.push(`model_sites = $${i++}`);   vals.push(model_sites); }
    if (accesses !== undefined)      { updates.push(`accesses = $${i++}`);      vals.push(accesses); }
    if (contact_name !== undefined)  { updates.push(`contact_name = $${i++}`);  vals.push(contact_name); }
    if (contact_email !== undefined) { updates.push(`contact_email = $${i++}`); vals.push(contact_email); }
    if (source_type !== undefined)   { updates.push(`source_type = $${i++}`);   vals.push(source_type); }
    if (deal_type !== undefined)     { updates.push(`deal_type = $${i++}`);     vals.push(deal_type); }
    if (created_by !== undefined)    { updates.push(`created_by = $${i++}`);    vals.push(created_by || null); }
    if (accounts !== undefined)      { updates.push(`accounts = $${i++}`);      vals.push(accounts); }
    if (deadline !== undefined)      { updates.push(`deadline = $${i++}`);      vals.push(deadline || null); }

    const { subscriber_id } = req.body;
    if (subscriber_id !== undefined) {
      updates.push(`subscriber_id = $${i++}`);
      vals.push(subscriber_id || null);
      if (!contact_name && subscriber_id) {
        const sub = await one('SELECT full_name FROM subscribers WHERE id = $1', [subscriber_id]);
        if (sub) { updates.push(`contact_name = $${i++}`); vals.push(sub.full_name); }
      }
    }

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
