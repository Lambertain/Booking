const express = require('express');
const bcrypt = require('bcryptjs');
const { one } = require('../db');
const { signToken, verifyTelegramInitData } = require('../auth');

const router = express.Router();

// POST /api/auth/login — email + password
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    const user = await one('SELECT * FROM users WHERE email = $1 AND is_active = TRUE', [email]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken({ id: user.id, role: user.role, name: user.name });
    res.json({ token, user: { id: user.id, role: user.role, name: user.name, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/tg — Telegram initData (TWA)
router.post('/tg', async (req, res) => {
  try {
    const { initData } = req.body;
    if (!initData) return res.status(400).json({ error: 'initData required' });

    const tgUser = verifyTelegramInitData(initData);

    let user = await one('SELECT * FROM users WHERE telegram_id = $1 AND is_active = TRUE', [tgUser.id]);
    if (!user) return res.status(403).json({ error: 'User not registered. Contact admin.' });

    // Update telegram_username if changed
    if (tgUser.username && tgUser.username !== user.telegram_username) {
      await one('UPDATE users SET telegram_username = $1 WHERE id = $2', [tgUser.username, user.id]);
    }

    const token = signToken({ id: user.id, role: user.role, name: user.name });
    res.json({ token, user: { id: user.id, role: user.role, name: user.name } });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', require('../auth').requireAuth(), (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
