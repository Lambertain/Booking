// Import bot subscribers from SendPulse CSV export into Railway PostgreSQL subscribers table
// Usage: node scripts/import-subscribers.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { Pool } = require('../app/node_modules/pg');

const DB_URL = process.env.DATABASE_PUBLIC_URL
  || 'postgresql://postgres:KeJNFQKcKihncBIEllYUwNZUMwtfPpKC@gondola.proxy.rlwy.net:27793/railway';

const CSV_FILE = path.resolve(__dirname, '../export_652c2e2c2df127a45d016c3a_1774653119.csv');

function parseCSV(raw) {
  const results = [];
  // Replace \r\n and \r with \n
  const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  let i = 0;

  function parseField() {
    if (text[i] === '"') {
      i++; // skip opening quote
      let field = '';
      while (i < text.length) {
        if (text[i] === '"' && text[i + 1] === '"') {
          field += '"'; i += 2;
        } else if (text[i] === '"') {
          i++; break;
        } else {
          field += text[i++];
        }
      }
      return field;
    } else {
      let field = '';
      while (i < text.length && text[i] !== ',' && text[i] !== '\n') {
        field += text[i++];
      }
      return field;
    }
  }

  // Skip header line
  while (i < text.length && text[i] !== '\n') i++;
  i++; // skip \n

  while (i < text.length) {
    const row = [];
    let firstOfLine = true;
    while (i < text.length) {
      if (!firstOfLine) {
        if (text[i] === ',') i++; // skip comma
        else if (text[i] === '\n') { i++; break; } // end of row
        else break;
      }
      firstOfLine = false;
      row.push(parseField());
    }
    if (row.length > 1) results.push(row);
  }
  return results;
}

function parseDate(str) {
  if (!str) return null;
  // Format: "27/03/2026 17:35:28"
  const [datePart, timePart] = str.trim().split(' ');
  if (!datePart) return null;
  const [d, m, y] = datePart.split('/');
  return `${y}-${m}-${d}T${timePart || '00:00:00'}Z`;
}

async function main() {
  const pool = new Pool({ connectionString: DB_URL });

  // Ensure table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscribers (
      id              SERIAL PRIMARY KEY,
      telegram_id     TEXT UNIQUE NOT NULL,
      username        TEXT,
      full_name       TEXT,
      status          TEXT DEFAULT 'active',
      tags            TEXT[] DEFAULT '{}',
      subscribed_at   TIMESTAMPTZ,
      last_activity_at TIMESTAMPTZ,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const raw = fs.readFileSync(CSV_FILE, 'utf8');
  const rows = parseCSV(raw);
  console.log(`Parsed ${rows.length} rows`);

  let inserted = 0, updated = 0, skipped = 0;

  for (const cols of rows) {
    const telegramId = cols[0]?.trim();
    const username   = cols[2]?.trim() || null;
    const fullName   = cols[3]?.trim() || null;
    const status     = cols[4]?.trim() || 'active';
    const lastAct    = parseDate(cols[5]);
    const subAt      = parseDate(cols[6]);
    const rawTags    = cols[7]?.trim() || '';

    // Skip groups (negative IDs) and empty
    if (!telegramId || parseInt(telegramId) < 0) { skipped++; continue; }

    const tags = rawTags
      ? rawTags.split(',').map(t => t.trim()).filter(Boolean)
      : [];

    try {
      const res = await pool.query(
        `INSERT INTO subscribers (telegram_id, username, full_name, status, tags, subscribed_at, last_activity_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (telegram_id) DO UPDATE SET
           username = EXCLUDED.username,
           full_name = EXCLUDED.full_name,
           status = EXCLUDED.status,
           tags = EXCLUDED.tags,
           subscribed_at = EXCLUDED.subscribed_at,
           last_activity_at = EXCLUDED.last_activity_at
         RETURNING (xmax = 0) as is_new`,
        [telegramId, username, fullName, status, tags, subAt, lastAct]
      );
      if (res.rows[0]?.is_new) inserted++; else updated++;
    } catch (err) {
      console.error(`Error for ${telegramId}:`, err.message);
      skipped++;
    }
  }

  console.log(`Done: ${inserted} inserted, ${updated} updated, ${skipped} skipped`);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
