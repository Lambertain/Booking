// Import CRM deals from SendPulse CSV export into mailing_orders table
// Usage: node scripts/import-crm-deals.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { Pool } = require('../app/node_modules/pg');

const DB_URL = process.env.DATABASE_PUBLIC_URL
  || 'postgresql://postgres:KeJNFQKcKihncBIEllYUwNZUMwtfPpKC@gondola.proxy.rlwy.net:27793/railway';

const CSV_FILE = path.resolve(__dirname, '../sendPulse_crm_deals_export_Sat Mar 28 2026.csv');

function parseCSV(raw) {
  const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = [];
  let i = 0;

  function parseField() {
    if (text[i] === '"') {
      i++;
      let field = '';
      while (i < text.length) {
        if (text[i] === '"' && text[i + 1] === '"') { field += '"'; i += 2; }
        else if (text[i] === '"') { i++; break; }
        else field += text[i++];
      }
      return field;
    } else {
      let field = '';
      while (i < text.length && text[i] !== ',' && text[i] !== '\n') field += text[i++];
      return field;
    }
  }

  // Skip BOM if present
  if (text.charCodeAt(0) === 0xFEFF) i++;

  // Parse header
  const header = [];
  while (i < text.length && text[i] !== '\n') {
    header.push(parseField());
    if (text[i] === ',') i++;
  }
  i++; // skip \n

  while (i < text.length) {
    const row = {};
    for (let col = 0; col < header.length; col++) {
      row[header[col]] = parseField();
      if (col < header.length - 1 && text[i] === ',') i++;
    }
    if (text[i] === '\n') i++;
    if (Object.values(row).some(v => v.trim())) lines.push(row);
  }
  return lines;
}

function parseDate(str) {
  if (!str || !str.trim()) return null;
  // Format: "2026-04-09 00:00"
  const s = str.trim();
  if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s.split(' ')[0];
  return null;
}

// Map deal_step to mailing_orders status
function mapStatus(step) {
  const s = (step || '').trim();
  if (s === 'Утверждена') return 'done';
  if (s === 'В процессе') return 'in_progress';
  if (s === 'Не утверждена') return 'new';
  if (s === 'Отмена' || s === 'Удалить') return 'cancelled';
  if (s === 'Instagram') return 'new';
  return 'new';
}

async function main() {
  const pool = new Pool({ connectionString: DB_URL });

  // Run migration 010 inline (idempotent)
  await pool.query(`ALTER TABLE mailing_orders ALTER COLUMN client_id DROP NOT NULL`).catch(() => {});
  await pool.query(`ALTER TABLE mailing_orders ADD COLUMN IF NOT EXISTS deal_id TEXT UNIQUE`);
  await pool.query(`ALTER TABLE mailing_orders ADD COLUMN IF NOT EXISTS deal_step TEXT`);
  await pool.query(`ALTER TABLE mailing_orders ADD COLUMN IF NOT EXISTS responsible TEXT`);
  await pool.query(`ALTER TABLE mailing_orders ADD COLUMN IF NOT EXISTS tour_start_2 DATE`);
  await pool.query(`ALTER TABLE mailing_orders ADD COLUMN IF NOT EXISTS tour_end_2 DATE`);
  await pool.query(`ALTER TABLE mailing_orders ADD COLUMN IF NOT EXISTS model_sites TEXT`);
  await pool.query(`ALTER TABLE mailing_orders ADD COLUMN IF NOT EXISTS contact_name TEXT`);
  await pool.query(`ALTER TABLE mailing_orders ADD COLUMN IF NOT EXISTS contact_email TEXT`);
  await pool.query(`ALTER TABLE mailing_orders ADD COLUMN IF NOT EXISTS source_type TEXT`);
  await pool.query(`ALTER TABLE mailing_orders ADD COLUMN IF NOT EXISTS review TEXT`);
  await pool.query(`ALTER TABLE mailing_orders ADD COLUMN IF NOT EXISTS lesson TEXT`);
  await pool.query(`ALTER TABLE mailing_orders ADD COLUMN IF NOT EXISTS contact_phone TEXT`);
  await pool.query(`ALTER TABLE mailing_orders ADD COLUMN IF NOT EXISTS deal_currency TEXT`);

  const raw = fs.readFileSync(CSV_FILE, 'utf8');
  const rows = parseCSV(raw);
  console.log(`Parsed ${rows.length} deals`);

  let inserted = 0, updated = 0, errors = 0;

  for (const r of rows) {
    const dealId    = r['deal_id']?.trim();
    if (!dealId) continue;

    const dealName  = r['deal_name']?.trim() || null;
    const price     = parseFloat(r['deal_price']) || 0;
    const dealStep  = r['deal_step']?.trim() || null;
    const responsible = r['deal_responsible']?.trim() || null;
    const status    = mapStatus(dealStep);
    const rentalStart = parseDate(r['"Начало тура"'] || r['Начало тура']);
    const rentalEnd   = parseDate(r['"Окончание тура"'] || r['Окончание тура']);
    const tourStart2  = parseDate(r['"Начало тура 2"'] || r['Начало тура 2']);
    const tourEnd2    = parseDate(r['"Окончание тура 2"'] || r['Окончание тура 2']);
    const modelSites  = r['"модельные сайты"']?.trim() || r['модельные сайты']?.trim() || null;
    const contactName  = r['contact_1_fullName']?.trim() || null;
    const contactEmail = r['contact_1_emails']?.trim() || null;
    const sourceType     = r['deal_source_type']?.trim() || null;
    const createdAt      = r['deal_created_at']?.trim() || null;
    const review         = r['Отзыв']?.trim() || null;
    const lesson         = r['УРОК']?.trim() || null;
    const contactPhone   = r['contact_1_phones']?.trim() || null;
    const dealCurrency   = r['deal_currency']?.trim() || null;
    const orderType    = 'rent'; // default

    try {
      const res = await pool.query(
        `INSERT INTO mailing_orders
           (deal_id, template_name, status, price, order_type,
            rental_start, rental_end, tour_start_2, tour_end_2,
            deal_step, responsible, model_sites,
            contact_name, contact_email, source_type,
            review, lesson, contact_phone, deal_currency,
            created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
                 $16,$17,$18,$19,
                 COALESCE($20::timestamptz, NOW()))
         ON CONFLICT (deal_id) DO UPDATE SET
           template_name = EXCLUDED.template_name,
           status = EXCLUDED.status,
           price = EXCLUDED.price,
           rental_start = EXCLUDED.rental_start,
           rental_end = EXCLUDED.rental_end,
           tour_start_2 = EXCLUDED.tour_start_2,
           tour_end_2 = EXCLUDED.tour_end_2,
           deal_step = EXCLUDED.deal_step,
           responsible = EXCLUDED.responsible,
           model_sites = EXCLUDED.model_sites,
           contact_name = EXCLUDED.contact_name,
           contact_email = EXCLUDED.contact_email,
           source_type = EXCLUDED.source_type,
           review = EXCLUDED.review,
           lesson = EXCLUDED.lesson,
           contact_phone = EXCLUDED.contact_phone,
           deal_currency = EXCLUDED.deal_currency
         RETURNING (xmax = 0) as is_new`,
        [dealId, dealName, status, price, orderType,
         rentalStart, rentalEnd, tourStart2, tourEnd2,
         dealStep, responsible, modelSites,
         contactName, contactEmail, sourceType,
         review, lesson, contactPhone, dealCurrency,
         createdAt]
      );
      if (res.rows[0]?.is_new) inserted++; else updated++;
      console.log(`  ${res.rows[0]?.is_new ? 'INSERT' : 'UPDATE'} ${dealId} "${dealName}" [${dealStep}]`);
    } catch (err) {
      console.error(`  ERROR ${dealId}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\nDone: ${inserted} inserted, ${updated} updated, ${errors} errors`);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
