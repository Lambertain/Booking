const express = require('express');
const { all, one } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// GET /api/analytics?period=week&tz=+02:00&model=ana-v
router.get('/', requireAuth('admin', 'manager'), async (req, res) => {
  try {
    const period = req.query.period || 'week'; // day | week | month | year
    const tz = req.query.tz || '+00:00';
    const modelFilter = req.query.model && req.query.model !== 'all' ? req.query.model : null;

    const tzMatch = tz.match(/([+-])(\d{2}):(\d{2})/);
    const tzOffsetMin = tzMatch
      ? (tzMatch[1] === '+' ? 1 : -1) * (parseInt(tzMatch[2]) * 60 + parseInt(tzMatch[3]))
      : 0;

    const nowUtcMs = Date.now();
    const localMs  = nowUtcMs + tzOffsetMin * 60000;
    const localNow = new Date(localMs);

    function localToUtc(y, mo, d, h, mi, s, ms) {
      return new Date(Date.UTC(y, mo, d, h, mi, s, ms) - tzOffsetMin * 60000);
    }

    const ly = localNow.getUTCFullYear();
    const lm = localNow.getUTCMonth();
    const ld = localNow.getUTCDate();

    let trunc, from, to;

    if (period === 'day') {
      trunc = 'hour';
      from = localToUtc(ly, lm, ld, 0, 0, 0, 0);
      to   = localToUtc(ly, lm, ld, 23, 59, 59, 999);
    } else if (period === 'week') {
      trunc = 'day';
      const weekAgo = new Date(localMs - 6 * 86400000);
      from = localToUtc(weekAgo.getUTCFullYear(), weekAgo.getUTCMonth(), weekAgo.getUTCDate(), 0, 0, 0, 0);
      to   = localToUtc(ly, lm, ld, 23, 59, 59, 999);
    } else if (period === 'month') {
      trunc = 'day';
      from = localToUtc(ly, lm, 1, 0, 0, 0, 0);
      to   = localToUtc(ly, lm, ld, 23, 59, 59, 999);
    } else {
      trunc = 'month';
      from = localToUtc(ly, 0, 1, 0, 0, 0, 0);
      to   = localToUtc(ly, lm, ld, 23, 59, 59, 999);
    }

    const fromIso = from.toISOString();
    const toIso   = to.toISOString();

    // Build model filter clause
    const modelClause = modelFilter ? ` AND model_slug = $3` : '';
    const baseParams = modelFilter ? [fromIso, toIso, modelFilter] : [fromIso, toIso];

    // --- Pipeline totals: seen, uninterested ---
    const pipelineTotals = await one(`
      SELECT
        COALESCE(SUM(total_seen), 0)         AS seen,
        COALESCE(SUM(total_queued), 0)       AS queued,
        COALESCE(SUM(total_uninterested), 0) AS uninterested
      FROM pipeline_stats
      WHERE created_at >= $1 AND created_at <= $2${modelClause}
    `, baseParams);

    // --- Delivery totals: sent, edited, failed ---
    const deliveryTotals = await one(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'sent')                      AS sent,
        COUNT(*) FILTER (WHERE status = 'sent' AND action = 'edited') AS edited,
        COUNT(*) FILTER (WHERE status = 'failed')                    AS failed
      FROM delivery_log
      WHERE created_at >= $1 AND created_at <= $2${modelClause}
    `, baseParams);

    // --- Chart: sent/edited/failed per time bucket ---
    const chartModelClause = modelFilter ? ` AND model_slug = $4` : '';
    const chartParams = modelFilter ? [trunc, fromIso, toIso, modelFilter] : [trunc, fromIso, toIso];
    const chartRows = await all(`
      SELECT
        date_trunc($1, created_at AT TIME ZONE ${ modelFilter ? '$5' : '$4'}) AS bucket,
        COUNT(*) FILTER (WHERE status = 'sent')                       AS sent,
        COUNT(*) FILTER (WHERE status = 'sent' AND action = 'edited') AS edited,
        COUNT(*) FILTER (WHERE status = 'failed')                     AS failed
      FROM delivery_log
      WHERE created_at >= $2 AND created_at <= $3${chartModelClause}
      GROUP BY bucket
      ORDER BY bucket
    `, modelFilter ? [trunc, fromIso, toIso, modelFilter, tz] : [trunc, fromIso, toIso, tz]);

    // --- Last 10 errors ---
    const errors = await all(`
      SELECT photographer, site, model_name, error_message, created_at
      FROM delivery_log
      WHERE status = 'failed'
        AND created_at >= $1 AND created_at <= $2${modelClause}
      ORDER BY created_at DESC
      LIMIT 10
    `, baseParams);

    // --- Models list ---
    const modelRows = await all(`
      SELECT DISTINCT model_slug FROM (
        SELECT model_slug FROM delivery_log WHERE model_slug IS NOT NULL
        UNION
        SELECT model_slug FROM pipeline_stats WHERE model_slug IS NOT NULL
      ) t
      ORDER BY model_slug
    `, []);

    res.json({
      period,
      from: fromIso,
      to:   toIso,
      totals: {
        seen:     parseInt(pipelineTotals?.seen     || 0),
        sent:     parseInt(deliveryTotals?.sent     || 0),
        edited:   parseInt(deliveryTotals?.edited   || 0),
        skipped:  parseInt(pipelineTotals?.uninterested || 0),
        errors:   parseInt(deliveryTotals?.failed   || 0),
      },
      chart: chartRows.map(r => ({
        bucket: r.bucket,
        sent:   parseInt(r.sent   || 0),
        edited: parseInt(r.edited || 0),
        failed: parseInt(r.failed || 0),
      })),
      errorLog: errors.map(e => ({
        photographer:  e.photographer,
        site:          e.site,
        model_name:    e.model_name,
        error_message: e.error_message,
        created_at:    e.created_at,
      })),
      models: modelRows.map(r => r.model_slug),
    });
  } catch (err) {
    console.error('[analytics]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
