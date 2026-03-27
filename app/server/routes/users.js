const express = require('express');
const bcrypt = require('bcryptjs');
const { query, one, all } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// GET /api/users — list all (admin) or assigned models (manager)
router.get('/', requireAuth('admin', 'manager'), async (req, res) => {
  try {
    const { role, id } = req.user;
    let rows;
    if (role === 'manager') {
      rows = await all(
        `SELECT u.id, u.role, u.name, u.email, u.telegram_username, u.is_active
         FROM users u JOIN manager_models mm ON mm.model_id = u.id WHERE mm.manager_id = $1`,
        [id]
      );
    } else {
      const roleFilter = req.query.role;
      const managerFilter = req.query.manager_id;
      if (roleFilter === 'model' && managerFilter) {
        rows = await all(
          `SELECT u.id, u.role, u.name, u.email, u.telegram_username, u.is_active,
                  am.slug, am.display_name
           FROM users u
           LEFT JOIN agency_models am ON am.user_id = u.id
           JOIN manager_models mm ON mm.model_id = u.id
           WHERE u.role = 'model' AND mm.manager_id = $1
           ORDER BY u.name`,
          [managerFilter]
        );
      } else if (roleFilter === 'model') {
        rows = await all(
          `SELECT u.id, u.role, u.name, u.email, u.telegram_username, u.is_active, u.created_at, u.photo_url,
                  am.slug, am.display_name, am.city, am.instagram, am.rates,
                  am.sites_json, am.tours_json, am.styles_json, am.portfolio_url
           FROM users u
           LEFT JOIN agency_models am ON am.user_id = u.id
           WHERE u.role = 'model' AND u.is_active = TRUE AND am.slug IS NOT NULL
           ORDER BY u.created_at`,
          []
        );
      } else if (roleFilter) {
        rows = await all(
          `SELECT id, role, name, email, telegram_username, is_active, created_at FROM users WHERE role = $1 ORDER BY created_at`,
          [roleFilter]
        );
      } else {
        rows = await all(
          `SELECT id, role, name, email, telegram_username, is_active, created_at FROM users ORDER BY created_at`,
          []
        );
      }
    }
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users — create user (admin only)
router.post('/', requireAuth('admin'), async (req, res) => {
  try {
    const { role, name, email, password, telegram_id, telegram_username } = req.body;
    if (!role || !name) return res.status(400).json({ error: 'role and name required' });

    const hash = password ? await bcrypt.hash(password, 10) : null;
    const user = await one(
      `INSERT INTO users (role, name, email, password_hash, telegram_id, telegram_username)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, role, name, email, telegram_username`,
      [role, name, email || null, hash, telegram_id || null, telegram_username || null]
    );

    // If model — also insert into agency_models
    if (role === 'model') {
      const slug = req.body.slug || name.toLowerCase().replace(/\s+/g, '-');
      await query(
        `INSERT INTO agency_models (user_id, slug, display_name, portfolio_url, commission_pct)
         VALUES ($1,$2,$3,$4,$5)`,
        [user.id, slug, name, req.body.portfolio_url || null, req.body.commission_pct || null]
      );
    }

    // If client — also insert into clients
    if (role === 'client') {
      await query(
        `INSERT INTO clients (user_id, company_name, contact_person) VALUES ($1,$2,$3)`,
        [user.id, req.body.company_name || null, req.body.contact_person || null]
      );
    }

    res.status(201).json(user);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'User already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/users/:id
router.patch('/:id', requireAuth('admin'), async (req, res) => {
  try {
    const { name, email, password, telegram_id, telegram_username, is_active } = req.body;
    const updates = [];
    const vals = [];
    let i = 1;
    if (name !== undefined)               { updates.push(`name = $${i++}`);               vals.push(name); }
    if (email !== undefined)              { updates.push(`email = $${i++}`);              vals.push(email); }
    if (telegram_id !== undefined)        { updates.push(`telegram_id = $${i++}`);        vals.push(telegram_id); }
    if (telegram_username !== undefined)  { updates.push(`telegram_username = $${i++}`);  vals.push(telegram_username); }
    if (is_active !== undefined)          { updates.push(`is_active = $${i++}`);          vals.push(is_active); }
    if (password)                         { updates.push(`password_hash = $${i++}`);      vals.push(await bcrypt.hash(password, 10)); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    vals.push(req.params.id);
    const row = await one(`UPDATE users SET ${updates.join(', ')} WHERE id = $${i} RETURNING id, role, name, email, is_active`, vals);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/users/:id/profile — update model profile (admin, manager, or the model itself)
router.patch('/:id/profile', requireAuth('admin', 'manager', 'model'), async (req, res) => {
  try {
    const { display_name, city, instagram, rates, sites_json, tours_json, styles_json } = req.body;
    const { role, id: callerId } = req.user;
    const targetId = parseInt(req.params.id);

    // Models can only edit their own profile
    if (role === 'model' && callerId !== targetId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const updates = [];
    const vals = [];
    let i = 1;
    if (display_name !== undefined) { updates.push(`display_name = $${i++}`); vals.push(display_name); }
    if (city !== undefined)         { updates.push(`city = $${i++}`);         vals.push(city); }
    if (instagram !== undefined)    { updates.push(`instagram = $${i++}`);    vals.push(instagram); }
    if (rates !== undefined)        { updates.push(`rates = $${i++}`);        vals.push(rates); }
    if (sites_json !== undefined)   { updates.push(`sites_json = $${i++}`);   vals.push(JSON.stringify(sites_json)); }
    if (tours_json !== undefined)   { updates.push(`tours_json = $${i++}`);   vals.push(JSON.stringify(tours_json)); }
    if (styles_json !== undefined)  { updates.push(`styles_json = $${i++}`);  vals.push(JSON.stringify(styles_json)); }

    if (display_name !== undefined) {
      await query('UPDATE users SET name = $1 WHERE id = $2', [display_name, targetId]);
    }

    if (updates.length) {
      vals.push(targetId);
      await query(
        `UPDATE agency_models SET ${updates.join(', ')} WHERE user_id = $${i}`,
        vals
      );
    }

    const row = await one(
      `SELECT u.id, u.name, u.telegram_username, u.photo_url, am.display_name, am.city, am.instagram,
              am.rates, am.sites_json, am.tours_json, am.styles_json, am.slug
       FROM users u LEFT JOIN agency_models am ON am.user_id = u.id WHERE u.id = $1`,
      [targetId]
    );
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/manager-models — assign model to manager
router.post('/manager-models', requireAuth('admin'), async (req, res) => {
  try {
    const { manager_id, model_id } = req.body;
    await query(
      `INSERT INTO manager_models (manager_id, model_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [manager_id, model_id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/manager-models
router.delete('/manager-models', requireAuth('admin'), async (req, res) => {
  try {
    const { manager_id, model_id } = req.body;
    await query('DELETE FROM manager_models WHERE manager_id=$1 AND model_id=$2', [manager_id, model_id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
