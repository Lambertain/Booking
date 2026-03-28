// Import CRM template deals from SendPulse CSV export into mailing_templates table
// Usage: node scripts/import-crm-templates.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { Pool } = require('../app/node_modules/pg');

const DB_URL = process.env.DATABASE_PUBLIC_URL
  || 'postgresql://postgres:KeJNFQKcKihncBIEllYUwNZUMwtfPpKC@gondola.proxy.rlwy.net:27793/railway';

const CSV_FILE = path.resolve(__dirname, '../shablony.csv');

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
  const s = str.trim();
  if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s.split(' ')[0];
  return null;
}

function mapStatus(step) {
  const s = (step || '').trim();
  if (s === 'В работе') return 'in_progress';
  if (s === 'Удалить') return 'cancelled';
  if (s === 'Готово' || s === 'Выполнено') return 'done';
  return 'new';
}

async function main() {
  const pool = new Pool({ connectionString: DB_URL });

  // Run migration 011 inline (idempotent)
  await pool.query(`ALTER TABLE mailing_templates ALTER COLUMN content DROP NOT NULL`).catch(() => {});
  await pool.query(`ALTER TABLE mailing_templates ADD COLUMN IF NOT EXISTS deal_id TEXT UNIQUE`);
  await pool.query(`ALTER TABLE mailing_templates ADD COLUMN IF NOT EXISTS deal_step TEXT`);
  await pool.query(`ALTER TABLE mailing_templates ADD COLUMN IF NOT EXISTS responsible TEXT`);
  await pool.query(`ALTER TABLE mailing_templates ADD COLUMN IF NOT EXISTS model_sites TEXT`);
  await pool.query(`ALTER TABLE mailing_templates ADD COLUMN IF NOT EXISTS contact_name TEXT`);
  await pool.query(`ALTER TABLE mailing_templates ADD COLUMN IF NOT EXISTS contact_email TEXT`);
  await pool.query(`ALTER TABLE mailing_templates ADD COLUMN IF NOT EXISTS source_type TEXT`);
  await pool.query(`ALTER TABLE mailing_templates ADD COLUMN IF NOT EXISTS deal_type TEXT`);
  await pool.query(`ALTER TABLE mailing_templates ADD COLUMN IF NOT EXISTS accesses TEXT`);
  await pool.query(`ALTER TABLE mailing_templates ADD COLUMN IF NOT EXISTS price NUMERIC(10,2) DEFAULT 0`);

  const raw = fs.readFileSync(CSV_FILE, 'utf8');
  const rows = parseCSV(raw);
  console.log(`Parsed ${rows.length} templates`);

  let inserted = 0, updated = 0, errors = 0;

  for (const r of rows) {
    const dealId    = r['deal_id']?.trim();
    if (!dealId) continue;

    const dealName    = r['deal_name']?.trim() || null;
    const price       = parseFloat(r['deal_price']) || 0;
    const dealStep    = r['deal_step']?.trim() || null;
    const responsible = r['deal_responsible']?.trim() || null;
    const sourceType  = r['deal_source_type']?.trim() || null;
    const dealType    = r['deal_type']?.trim() || null;
    const modelSites  = r['"модельные сайты"']?.trim() || r['модельные сайты']?.trim() || null;
    const accesses    = r['Доступы']?.trim() || null;
    const contactName  = r['contact_1_fullName']?.trim() || null;
    const contactEmail = r['contact_1_emails']?.trim() || null;
    const rentalEnd   = parseDate(r['deal_expiration_datetime']);
    const createdAt   = r['deal_created_at']?.trim() || null;

    try {
      const res = await pool.query(
        `INSERT INTO mailing_templates
           (deal_id, name, deal_step, responsible, source_type, deal_type,
            model_sites, accesses, contact_name, contact_email,
            price, rental_end, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
                 COALESCE($13::timestamptz, NOW()))
         ON CONFLICT (deal_id) DO UPDATE SET
           name = EXCLUDED.name,
           deal_step = EXCLUDED.deal_step,
           responsible = EXCLUDED.responsible,
           source_type = EXCLUDED.source_type,
           deal_type = EXCLUDED.deal_type,
           model_sites = EXCLUDED.model_sites,
           accesses = EXCLUDED.accesses,
           contact_name = EXCLUDED.contact_name,
           contact_email = EXCLUDED.contact_email,
           price = EXCLUDED.price,
           rental_end = EXCLUDED.rental_end
         RETURNING (xmax = 0) as is_new`,
        [dealId, dealName, dealStep, responsible, sourceType, dealType,
         modelSites, accesses, contactName, contactEmail,
         price, rentalEnd, createdAt]
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
