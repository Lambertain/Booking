const express = require('express');
const https = require('https');
const { all, query } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

function tgPost(method, body) {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve(JSON.parse(raw)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// GET /api/broadcast/tags — all unique tags with subscriber counts
router.get('/tags', requireAuth('admin', 'manager'), async (req, res) => {
  try {
    const rows = await all(
      `SELECT tag, COUNT(*) as count
       FROM subscribers, unnest(tags) as tag
       WHERE status = 'active' AND telegram_id::bigint > 0
       GROUP BY tag ORDER BY count DESC`,
      []
    );
    // Also total active count
    const total = await all(
      `SELECT COUNT(*) as count FROM subscribers WHERE status = 'active' AND telegram_id::bigint > 0`,
      []
    );
    res.json({ tags: rows, total: parseInt(total[0]?.count || 0) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/broadcast/subscribers — subscriber count by tag filter
router.get('/subscribers', requireAuth('admin', 'manager'), async (req, res) => {
  try {
    const tags = req.query.tags ? req.query.tags.split(',') : [];
    let rows;
    if (tags.length === 0) {
      rows = await all(
        `SELECT telegram_id, full_name FROM subscribers WHERE status = 'active' AND telegram_id::bigint > 0`,
        []
      );
    } else {
      rows = await all(
        `SELECT telegram_id, full_name FROM subscribers WHERE status = 'active' AND telegram_id::bigint > 0 AND tags && $1`,
        [tags]
      );
    }
    res.json({ count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/broadcast — send message to subscribers
router.post('/', requireAuth('admin', 'manager'), async (req, res) => {
  const { text, tags } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text required' });

  let subscribers;
  try {
    if (!tags || tags.length === 0) {
      subscribers = await all(
        `SELECT telegram_id, full_name FROM subscribers WHERE status = 'active' AND telegram_id::bigint > 0`,
        []
      );
    } else {
      subscribers = await all(
        `SELECT telegram_id, full_name FROM subscribers WHERE status = 'active' AND telegram_id::bigint > 0 AND tags && $1`,
        [tags]
      );
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  // Respond immediately with count, send in background
  res.json({ ok: true, count: subscribers.length });

  // Send with 100ms delay between each to respect Telegram rate limits
  setImmediate(async () => {
    let sent = 0, failed = 0;
    for (const sub of subscribers) {
      try {
        const result = await tgPost('sendMessage', {
          chat_id: sub.telegram_id,
          text,
          parse_mode: 'HTML',
        });
        if (result.ok) {
          sent++;
        } else {
          failed++;
          // Mark as blocked if bot was blocked by user
          if (result.error_code === 403) {
            await query(
              `UPDATE subscribers SET status = 'blocked' WHERE telegram_id = $1`,
              [sub.telegram_id]
            ).catch(() => {});
          }
        }
      } catch {
        failed++;
      }
      await new Promise(r => setTimeout(r, 100));
    }
    console.log(`[broadcast] Sent ${sent}/${subscribers.length}, failed: ${failed}`);
  });
});

module.exports = router;
