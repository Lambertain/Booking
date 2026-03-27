/**
 * Import shoots from Airtable → Railway PostgreSQL
 * Usage: node scripts/import-airtable.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { Pool } = require('../app/node_modules/pg');

const DB_URL = 'postgresql://postgres:KeJNFQKcKihncBIEllYUwNZUMwtfPpKC@gondola.proxy.rlwy.net:27793/railway';
const AT_TOKEN = process.env.AIRTABLE_API_KEY;

const BASES = [
  { modelId: 6, baseId: 'appiM4XhlAOlOafvs' },
  { modelId: 5, baseId: 'appUU9lOKDhRSddyQ' },
  { modelId: 4, baseId: 'appZ2bwcCZxdQ93Zu' },
  { modelId: 7, baseId: 'apptpDSywL3IuQqNW' },
];

const TABLE_SHOOTS        = 'tblZbs1N8UApi3W60';
const TABLE_PHOTOGRAPHERS = 'tblzr47aNJxLv1hcz';

const STATUS_MAP = {
  'Реализована':         'done',
  'Утверждена':          'confirmed',
  'Резерв':              'reserve',
  'День расписан':       'day_scheduled',
  'Моя работа':          'negotiating',
  'Отменена фотографом': 'cancelled_photographer',
  'Отменена моделью':    'cancelled_model',
  'Отменена агентством': 'cancelled_agency',
};

async function atGetAll(baseId, tableId) {
  const records = [];
  let offset = null;
  do {
    const url = `https://api.airtable.com/v0/${baseId}/${tableId}?pageSize=100${offset ? `&offset=${offset}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${AT_TOKEN}` } });
    if (!res.ok) { const t = await res.text(); throw new Error(`AT ${res.status}: ${t.slice(0,200)}`); }
    const data = await res.json();
    records.push(...data.records);
    offset = data.offset;
  } while (offset);
  return records;
}

function extractTelegram(str) {
  if (!str) return null;
  const m = str.match(/(?:Telegram:|tg:|@)([A-Za-z0-9_]{4,})/i);
  return m ? m[1] : null;
}

function siteFromUrl(url) {
  if (!url) return null;
  if (url.includes('model-kartei')) return 'Model-Kartei';
  if (url.includes('adultfolio'))   return 'adultfolio.com';
  if (url.includes('purpleport'))   return 'PurplePort';
  if (url.includes('maxmodels'))    return 'MaxModels.pl';
  if (url.includes('kavyar'))       return 'Kavyar';
  if (url.includes('book.fr'))      return 'Book.Fr';
  if (url.includes('modelmayhem'))  return 'Model Mayhem';
  return null;
}

async function processBase(pool, { modelId, baseId }) {
  console.log(`\n=== model_id=${modelId}  base=${baseId} ===`);

  // Fetch photographers
  const phRaw = await atGetAll(baseId, TABLE_PHOTOGRAPHERS);
  console.log(`  Photographers: ${phRaw.length}`);

  const phMap = {};
  for (const r of phRaw) {
    const f = r.fields;
    const name    = (f['Name'] || '').trim();
    const phone   = f['Phone'] || null;
    const email   = f['Email'] || null;
    const social  = f['Соц сеть/'] || null;
    const siteArr = f['Сайт'] || [];

    let telegram = extractTelegram(phone) || extractTelegram(social);
    let site = null;
    if (siteArr.length > 0) {
      const sn = siteArr[0].name || '';
      site = siteFromUrl(sn) || (sn.length < 40 ? sn : null);
    }
    // If name itself is a URL (photographer listed as url)
    const displayName = name.startsWith('http') ? (siteFromUrl(name) || name) : name;

    phMap[r.id] = { name: displayName, phone, email, telegram, site };
  }

  // Fetch shoots
  const shootRaw = await atGetAll(baseId, TABLE_SHOOTS);
  console.log(`  Shoots: ${shootRaw.length}`);

  // Filter: only shoots with Статус фотосессии
  const validShoots = shootRaw.filter(r => r.fields['Статус фотосессии']);
  console.log(`  With status: ${validShoots.length}`);

  // Get existing DB shoots
  const { rows: dbShoots } = await pool.query(
    'SELECT id, photographer_name, shoot_date::text FROM shoots WHERE model_id = $1',
    [modelId]
  );
  console.log(`  DB shoots: ${dbShoots.length}`);

  let updated = 0, inserted = 0, skipped = 0;

  for (const r of validShoots) {
    const f = r.fields;
    const statusRaw = f['Статус фотосессии'];
    const status    = STATUS_MAP[statusRaw] || 'negotiating';
    const rate      = f['Бюджет'] || null;
    const dateRaw   = f['Начало'];
    const shootDate = dateRaw ? dateRaw.slice(0, 10) : null;
    const location  = f['Локация'] || f['Город, страна'] || null;
    const notes     = f['Примечание'] || null;

    // Get photographer via linked field
    const phLinks = f['Фотограф'] || [];
    const phId    = phLinks[0] || null;  // linked record ID
    const ph      = phId ? phMap[phId] : null;
    const phName  = ph?.name || null;

    if (!phName || phName.length < 2) { skipped++; continue; }

    const phNameNorm = phName.toLowerCase().trim();

    // Match DB shoot: by name + date, or just name
    let match = dbShoots.find(s =>
      s.photographer_name?.toLowerCase().trim() === phNameNorm &&
      shootDate && s.shoot_date && s.shoot_date.slice(0, 10) === shootDate
    );
    if (!match) {
      match = dbShoots.find(s =>
        s.photographer_name?.toLowerCase().trim() === phNameNorm
      );
    }

    if (match) {
      await pool.query(`
        UPDATE shoots SET
          status = $1,
          rate = COALESCE($2::numeric, rate),
          shoot_date = COALESCE($3::date, shoot_date),
          location = COALESCE($4, location),
          notes = COALESCE($5, notes),
          photographer_email = COALESCE($6, photographer_email),
          photographer_phone = COALESCE($7, photographer_phone),
          photographer_telegram = COALESCE($8, photographer_telegram),
          photographer_site = COALESCE($9, photographer_site)
        WHERE id = $10
      `, [status, rate, shootDate, location?.slice(0,200), notes?.slice(0,1000),
          ph?.email, ph?.phone, ph?.telegram, ph?.site, match.id]);
      updated++;
    } else {
      await pool.query(`
        INSERT INTO shoots
          (model_id, photographer_name, photographer_site, photographer_email,
           photographer_phone, photographer_telegram,
           shoot_date, location, rate, currency, status, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'EUR',$10,$11)
      `, [modelId, phName, ph?.site, ph?.email, ph?.phone, ph?.telegram,
          shootDate, location?.slice(0,200), rate, status, notes?.slice(0,1000)]);
      inserted++;
    }
  }

  console.log(`  → Updated: ${updated}  Inserted: ${inserted}  Skipped: ${skipped}`);
}

async function main() {
  if (!AT_TOKEN) { console.error('AIRTABLE_API_KEY not set'); process.exit(1); }
  const pool = new Pool({ connectionString: DB_URL });
  try {
    for (const base of BASES) {
      await processBase(pool, base);
    }
    console.log('\n✓ Done');
  } finally {
    await pool.end();
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
