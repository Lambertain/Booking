const express = require('express');
const { all, one } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// GET /api/analytics?period=week&tz=+02:00
router.get('/', requireAuth('admin', 'manager'), async (req, res) => {
  try {
    const period = req.query.period || 'week'; // day | week | month | year
    const tz = req.query.tz || '+00:00';

    let trunc, from, to;
    const now = new Date();

    if (period === 'day') {
      trunc = 'hour';
      from = new Date(now); from.setHours(0, 0, 0, 0);
      to   = new Date(now); to.setHours(23, 59, 59, 999);
    } else if (period === 'week') {
      trunc = 'day';
      from = new Date(now); from.setDate(now.getDate() - 6); from.setHours(0, 0, 0, 0);
      to   = new Date(now); to.setHours(23, 59, 59, 999);
    } else if (period === 'month') {
      trunc = 'day';
      from = new Date(now); from.setDate(1); from.setHours(0, 0, 0, 0);
      to   = new Date(now); to.setHours(23, 59, 59, 999);
    } else { // year
      trunc = 'month';
      from = new Date(now.getFullYear(), 0, 1);
      to   = new Date(now); to.setHours(23, 59, 59, 999);
    }

    const rows = await all(`
      SELECT
        date_trunc($1, created_at AT TIME ZONE $4) AS bucket,
        COUNT(*) FILTER (WHERE ai_draft IS NOT NULL)              AS processed,
        COUNT(*) FILTER (WHERE bot_action = 'approved')           AS approved,
        COUNT(*) FILTER (WHERE bot_action = 'edited')             AS edited,
        COUNT(*) FILTER (WHERE bot_action = 'skipped')            AS skipped,
        COUNT(*) FILTER (WHERE ai_draft IS NOT NULL AND bot_action IS NULL) AS pending
      FROM messages
      WHERE created_at >= $2 AND created_at <= $3
        AND ai_draft IS NOT NULL
      GROUP BY bucket
      ORDER BY bucket
    `, [trunc, from.toISOString(), to.toISOString(), tz]);

    // Summary totals for the period
    const totals = await one(`
      SELECT
        COUNT(*) FILTER (WHERE ai_draft IS NOT NULL)              AS processed,
        COUNT(*) FILTER (WHERE bot_action = 'approved')           AS approved,
        COUNT(*) FILTER (WHERE bot_action = 'edited')             AS edited,
        COUNT(*) FILTER (WHERE bot_action = 'skipped')            AS skipped,
        COUNT(*) FILTER (WHERE ai_draft IS NOT NULL AND bot_action IS NULL) AS pending
      FROM messages
      WHERE created_at >= $1 AND created_at <= $2
        AND ai_draft IS NOT NULL
    `, [from.toISOString(), to.toISOString()]);

    res.json({
      period,
      from: from.toISOString(),
      to: to.toISOString(),
      totals: {
        processed: parseInt(totals?.processed || 0),
        approved:  parseInt(totals?.approved  || 0),
        edited:    parseInt(totals?.edited    || 0),
        skipped:   parseInt(totals?.skipped   || 0),
        pending:   parseInt(totals?.pending   || 0),
      },
      chart: rows.map(r => ({
        bucket: r.bucket,
        processed: parseInt(r.processed || 0),
        approved:  parseInt(r.approved  || 0),
        edited:    parseInt(r.edited    || 0),
        skipped:   parseInt(r.skipped   || 0),
        pending:   parseInt(r.pending   || 0),
      })),
    });
  } catch (err) {
    console.error('[analytics]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
