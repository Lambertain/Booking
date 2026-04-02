const express = require('express');
const { all, one } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// GET /api/analytics?period=week&tz=+02:00&model=ana-v
router.get('/', requireAuth('admin', 'manager'), async (req, res) => {
  try {
    const period = req.query.period || 'week'; // day | week | month | year
    const tz = req.query.tz || '+00:00'; // e.g. +02:00
    const modelFilter = req.query.model && req.query.model !== 'all' ? req.query.model : null;

    // Parse UTC offset in minutes so we can compute correct local day boundaries
    const tzMatch = tz.match(/([+-])(\d{2}):(\d{2})/);
    const tzOffsetMin = tzMatch
      ? (tzMatch[1] === '+' ? 1 : -1) * (parseInt(tzMatch[2]) * 60 + parseInt(tzMatch[3]))
      : 0;

    // "Local now" as UTC ms adjusted by offset
    const nowUtcMs = Date.now();
    const localMs  = nowUtcMs + tzOffsetMin * 60000;
    const localNow = new Date(localMs);

    // Build from/to in local time, then convert back to UTC for DB query
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
    } else { // year
      trunc = 'month';
      from = localToUtc(ly, 0, 1, 0, 0, 0, 0);
      to   = localToUtc(ly, lm, ld, 23, 59, 59, 999);
    }

    const fromIso = from.toISOString();
    const toIso   = to.toISOString();

    // --- АПКА analytics (unchanged) ---
    const rows = await all(`
      SELECT
        date_trunc($1, created_at AT TIME ZONE $4) AS bucket,
        COUNT(*)                                                  AS processed,
        COUNT(*) FILTER (WHERE bot_action = 'approved')           AS approved,
        COUNT(*) FILTER (WHERE bot_action = 'edited')             AS edited,
        COUNT(*) FILTER (WHERE bot_action = 'skipped')            AS skipped,
        COUNT(*) FILTER (WHERE bot_action IS NULL)                AS pending
      FROM messages
      WHERE created_at >= $2 AND created_at <= $3
        AND ai_draft IS NOT NULL
      GROUP BY bucket
      ORDER BY bucket
    `, [trunc, fromIso, toIso, tz]);

    // Summary totals for the period
    const totals = await one(`
      SELECT
        COUNT(*)                                                  AS processed,
        COUNT(*) FILTER (WHERE bot_action = 'approved')           AS approved,
        COUNT(*) FILTER (WHERE bot_action = 'edited')             AS edited,
        COUNT(*) FILTER (WHERE bot_action = 'skipped')            AS skipped,
        COUNT(*) FILTER (WHERE bot_action IS NULL)                AS pending
      FROM messages
      WHERE created_at >= $1 AND created_at <= $2
        AND ai_draft IS NOT NULL
    `, [fromIso, toIso]);

    // --- Delivery stats from booking bot ---
    // Build model filter clause
    const deliveryParams = [fromIso, toIso];
    let deliveryModelClause = '';
    if (modelFilter) {
      deliveryParams.push(modelFilter);
      deliveryModelClause = ` AND model_slug = $${deliveryParams.length}`;
    }

    const deliverySummary = await one(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'sent')   AS sent,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed
      FROM delivery_log
      WHERE created_at >= $1 AND created_at <= $2${deliveryModelClause}
    `, deliveryParams);

    const errorParams = [...deliveryParams];
    const deliveryErrors = await all(`
      SELECT photographer, site, model_name, error_message, created_at
      FROM delivery_log
      WHERE status = 'failed'
        AND created_at >= $1 AND created_at <= $2${deliveryModelClause}
      ORDER BY created_at DESC
      LIMIT 10
    `, errorParams);

    // --- Pipeline stats from booking bot ---
    const pipelineParams = [fromIso, toIso];
    let pipelineModelClause = '';
    if (modelFilter) {
      pipelineParams.push(modelFilter);
      pipelineModelClause = ` AND model_slug = $${pipelineParams.length}`;
    }

    const pipelineSummary = await one(`
      SELECT
        COALESCE(SUM(total_seen), 0)          AS total_seen,
        COALESCE(SUM(total_queued), 0)        AS total_queued,
        COALESCE(SUM(total_uninterested), 0)  AS total_uninterested
      FROM pipeline_stats
      WHERE created_at >= $1 AND created_at <= $2${pipelineModelClause}
    `, pipelineParams);

    // --- Models list (distinct slugs from both tables) ---
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
      delivery: {
        sent:   parseInt(deliverySummary?.sent   || 0),
        failed: parseInt(deliverySummary?.failed || 0),
        errors: deliveryErrors.map(e => ({
          photographer:  e.photographer,
          site:          e.site,
          model_name:    e.model_name,
          error_message: e.error_message,
          created_at:    e.created_at,
        })),
      },
      pipeline: {
        total_seen:          parseInt(pipelineSummary?.total_seen         || 0),
        total_queued:        parseInt(pipelineSummary?.total_queued       || 0),
        total_uninterested:  parseInt(pipelineSummary?.total_uninterested || 0),
      },
      models: modelRows.map(r => r.model_slug),
    });
  } catch (err) {
    console.error('[analytics]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
