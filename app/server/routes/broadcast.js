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

// GET /api/broadcast/list — full subscriber list with search/filter
router.get('/list', requireAuth('admin', 'manager'), async (req, res) => {
  try {
    const { search, tag, status } = req.query;
    const conditions = ['telegram_id::bigint > 0'];
    const vals = [];
    let i = 1;
    if (status) { conditions.push(`status = $${i++}`); vals.push(status); }
    if (tag)    { conditions.push(`tags @> $${i++}`);  vals.push([tag]); }
    if (search) {
      conditions.push(`(full_name ILIKE $${i} OR username ILIKE $${i})`);
      vals.push(`%${search}%`); i++;
    }
    const rows = await all(
      `SELECT id, telegram_id, username, full_name, status, tags, subscribed_at, last_activity_at
       FROM subscribers WHERE ${conditions.join(' AND ')}
       ORDER BY last_activity_at DESC NULLS LAST, subscribed_at DESC
       LIMIT 200`,
      vals
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/broadcast/subscriber/:id — update tags, status, full_name
router.patch('/subscriber/:id', requireAuth('admin', 'manager'), async (req, res) => {
  try {
    const { tags, status, full_name } = req.body;
    const updates = [];
    const vals = [];
    let i = 1;
    if (tags !== undefined)      { updates.push(`tags = $${i++}`);      vals.push(tags); }
    if (status !== undefined)    { updates.push(`status = $${i++}`);    vals.push(status); }
    if (full_name !== undefined) { updates.push(`full_name = $${i++}`); vals.push(full_name); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    vals.push(req.params.id);
    const row = await query(
      `UPDATE subscribers SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
      vals
    );
    res.json(row.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/broadcast/tag-rename — rename a tag across all subscribers
router.patch('/tag-rename', requireAuth('admin', 'manager'), async (req, res) => {
  try {
    const { oldName, newName } = req.body;
    if (!oldName || !newName) return res.status(400).json({ error: 'oldName and newName required' });
    const result = await query(
      `UPDATE subscribers SET tags = array_replace(tags, $1, $2) WHERE $1 = ANY(tags)`,
      [oldName, newName]
    );
    res.json({ ok: true, updated: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/broadcast/tag/:name — remove a tag from all subscribers
router.delete('/tag/:name', requireAuth('admin', 'manager'), async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    const result = await query(
      `UPDATE subscribers SET tags = array_remove(tags, $1) WHERE $1 = ANY(tags)`,
      [name]
    );
    res.json({ ok: true, updated: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
