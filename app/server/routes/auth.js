const express = require('express');
const bcrypt = require('bcryptjs');
const { query, one } = require('../db');
const { signToken, verifyTelegramInitData } = require('../auth');

async function fetchTelegramPhotoUrl(telegramId) {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN || !telegramId) return null;
  try {
    const photosRes = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getUserProfilePhotos?user_id=${telegramId}&limit=1`
    );
    const photosData = await photosRes.json();
    if (!photosData.ok || !photosData.result.total_count) return null;
    const fileId = photosData.result.photos[0][0].file_id;
    const fileRes = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`
    );
    const fileData = await fileRes.json();
    if (!fileData.ok) return null;
    return `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;
  } catch { return null; }
}

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
    // Fallback: match by username (first login — telegram_id not set yet)
    if (!user && tgUser.username) {
      user = await one('SELECT * FROM users WHERE LOWER(telegram_username) = LOWER($1) AND is_active = TRUE', [tgUser.username]);
      if (user) {
        await one('UPDATE users SET telegram_id = $1 WHERE id = $2', [tgUser.id, user.id]);
        user.telegram_id = tgUser.id;
      }
    }
    if (!user) return res.status(403).json({ error: 'User not registered. Contact admin.' });

    // Update telegram_username if changed
    if (tgUser.username && tgUser.username !== user.telegram_username) {
      await one('UPDATE users SET telegram_username = $1 WHERE id = $2', [tgUser.username, user.id]);
    }

    // Fetch and store Telegram profile photo
    const photoUrl = await fetchTelegramPhotoUrl(tgUser.id);
    if (photoUrl) {
      await query('UPDATE users SET photo_url = $1 WHERE id = $2', [photoUrl, user.id]);
      user.photo_url = photoUrl;
    }

    const token = signToken({ id: user.id, role: user.role, name: user.name });
    res.json({ token, user: { id: user.id, role: user.role, name: user.name, photo_url: user.photo_url || null } });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// GET /api/auth/me — returns full DB data
router.get('/me', require('../auth').requireAuth(), async (req, res) => {
  try {
    const { id, role } = req.user;
    let user;
    if (role === 'model') {
      user = await one(
        `SELECT u.id, u.role, u.name, u.telegram_username, u.photo_url,
                am.display_name, am.city, am.instagram, am.rates,
                am.sites_json, am.tours_json, am.styles_json, am.slug
         FROM users u LEFT JOIN agency_models am ON am.user_id = u.id
         WHERE u.id = $1`,
        [id]
      );
    } else {
      user = await one(
        `SELECT id, role, name, email, telegram_username, photo_url FROM users WHERE id = $1`,
        [id]
      );
    }
    res.json({ user: user || req.user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
