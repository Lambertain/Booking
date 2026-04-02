/**
 * Backfill Allumma: sync all 'done' shoots since 2026-03-16
 * Usage: node scripts/backfill-allumma.js
 * Requires env: DATABASE_PUBLIC_URL (or DATABASE_URL), ALLUMMA_API_URL, ALLUMMA_SYNC_SECRET
 */
require('dotenv').config({ path: require('path').join(__dirname, '../app/.env') });

const { Pool } = require('pg');
const { syncShootToAllumma } = require('../app/server/allumma-sync');

const pool = new Pool({
  connectionString: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL,
});

async function main() {
  const { rows: shoots } = await pool.query(`
    SELECT s.*, u.name AS model_name
    FROM shoots s
    JOIN users u ON u.id = s.model_id
    WHERE s.status = 'done'
      AND s.shoot_date >= '2026-03-16'
      AND s.allumma_synced_at IS NULL
      AND s.rate IS NOT NULL AND s.rate > 0
    ORDER BY s.shoot_date ASC
  `);

  console.log(`Found ${shoots.length} shoots to sync\n`);
  if (shoots.length === 0) {
    console.log('Nothing to do.');
    await pool.end();
    return;
  }

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const shoot of shoots) {
    const shootDate = shoot.shoot_date
      ? new Date(shoot.shoot_date).toISOString().split('T')[0]
      : null;

    if (!shootDate) {
      console.log(`  SKIP #${shoot.id} — no shoot_date`);
      skipped++;
      continue;
    }

    try {
      const result = await syncShootToAllumma({
        bookingShootId: shoot.id,
        shootDate,
        rate: parseFloat(shoot.rate),
        currency: shoot.currency || 'EUR',
        modelName: shoot.model_name || null,
      });

      if (result?.alreadySynced) {
        console.log(`  SKIP #${shoot.id} — already in Allumma`);
        await pool.query('UPDATE shoots SET allumma_synced_at = NOW() WHERE id = $1', [shoot.id]);
        skipped++;
      } else if (result?.ok) {
        await pool.query('UPDATE shoots SET allumma_synced_at = NOW() WHERE id = $1', [shoot.id]);
        console.log(`  OK   #${shoot.id} — ${shoot.model_name}, ${shoot.rate} ${shoot.currency} (${shootDate})`);
        ok++;
      }
    } catch (err) {
      console.error(`  FAIL #${shoot.id} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone: ${ok} synced, ${skipped} skipped, ${failed} failed`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
