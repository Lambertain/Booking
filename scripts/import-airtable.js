/**
 * Import shoots from Airtable → Railway PostgreSQL
 * Usage: node scripts/import-airtable.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { Pool } = require('../app/node_modules/pg');

const DB_URL = 'postgresql://postgres:KeJNFQKcKihncBIEllYUwNZUMwtfPpKC@gondola.proxy.rlwy.net:27793/railway';
const AT_TOKEN = process.env.AIRTABLE_API_KEY;

const BASES = [
  { modelId: 4, baseId: 'appZ2bwcCZxdQ93Zu', name: 'Ana V' },
  { modelId: 5, baseId: 'appUU9lOKDhRSddyQ', name: 'Kisa' },
  { modelId: 6, baseId: 'appiM4XhlAOlOafvs', name: 'Victoria Polly' },
  { modelId: 7, baseId: 'apptpDSywL3IuQqNW', name: 'Violet Spes' },
];

const TABLE_SHOOTS        = 'tblZbs1N8UApi3W60';
const TABLE_PHOTOGRAPHERS = 'tblzr47aNJxLv1hcz';
const TABLE_SITES         = 'tblStjkeGLDPVIXrh';

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
    if (!res.ok) { const t = await res.text(); throw new Error(`AT ${res.status}: ${t.slice(0, 200)}`); }
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

// Parse time HH:MM from ISO datetime string (UTC)
function parseTime(dateRaw) {
  if (!dateRaw) return null;
  // e.g. "2024-03-15T10:00:00.000Z" → "10:00"
  const m = dateRaw.match(/T(\d{2}:\d{2})/);
  return m ? m[1] : null;
}

// Convert duration in seconds → hours (1 decimal)
function parseDuration(seconds) {
  if (!seconds || isNaN(seconds)) return null;
  return Math.round(seconds / 360) / 10; // rounded to 0.1h
}

async function processBase(pool, { modelId, baseId, name }) {
  console.log(`\n=== ${name} (model_id=${modelId}, base=${baseId}) ===`);

  // Fetch photographers
  let phRaw = [];
  try { phRaw = await atGetAll(baseId, TABLE_PHOTOGRAPHERS); } catch (e) { console.warn('  No photographers table:', e.message); }
  console.log(`  Photographers: ${phRaw.length}`);

  const phMap = {};
  for (const r of phRaw) {
    const f = r.fields;
    const name    = (f['Name'] || '').trim();
    const phone      = f['Phone'] || null;
    const email      = f['Email'] || null;
    const profileUrl = f['Соц сеть/'] || null;  // URL профиля на сайте
    const siteArr    = f['Сайт'] || [];

    const telegram = extractTelegram(phone) || extractTelegram(profileUrl);
    let site = null;
    if (siteArr.length > 0) {
      const sn = siteArr[0].name || '';
      site = siteFromUrl(sn) || (sn.length < 40 ? sn : null);
    }
    const displayName = name.startsWith('http') ? (siteFromUrl(name) || name) : name;
    phMap[r.id] = { name: displayName, phone, email, telegram, site, profileUrl };
  }

  // Fetch sites table for "Источник" resolution
  const siteMap = {};
  try {
    const sitesRaw = await atGetAll(baseId, TABLE_SITES);
    for (const r of sitesRaw) {
      const siteName = r.fields['Источник'] || r.fields['Name'] || r.fields['Название'] || r.fields['Сайт'] || null;
      if (siteName) siteMap[r.id] = siteName;
    }
    console.log(`  Sites: ${sitesRaw.length}`);
  } catch (e) {
    console.warn('  No sites table:', e.message);
  }

  // Fetch shoots
  const shootRaw = await atGetAll(baseId, TABLE_SHOOTS);
  console.log(`  Shoots total: ${shootRaw.length}`);

  const validShoots = shootRaw.filter(r => r.fields['Статус фотосессии']);
  console.log(`  With status: ${validShoots.length}`);

  let updated = 0, inserted = 0, skipped = 0;

  for (const r of validShoots) {
    const f = r.fields;
    const airtableId = r.id;

    const statusRaw  = f['Статус фотосессии'];
    const status     = STATUS_MAP[statusRaw] || 'negotiating';
    const rate       = f['Бюджет'] || null;
    const dateRaw    = f['Начало'] || null;
    const shootDate  = dateRaw ? dateRaw.slice(0, 10) : null;
    const shootTime  = parseTime(dateRaw);
    const durationSec = f['Длительность'] || null;
    const durationHours = parseDuration(durationSec);
    const location   = f['Локация'] || null;
    const city       = f['Город, страна'] || null;
    const notes      = f['Примечание'] || null;
    const shootStyle = f['Стиль съемки'] || null;
    const expenses   = f['Расходы'] || null;

    // Resolve Источник linked records → site names
    const sourceLinks = f['Источник'] || [];
    const sourceSite  = sourceLinks.length > 0
      ? (siteMap[sourceLinks[0]] || null)
      : null;

    // Service payment fields
    const serviceAmount   = f['Сумма оплаты сервиса'] || null;
    const serviceCurrency = f['Валюта'] || null;
    const serviceStatus   = f['Статус сервиса'] || null;
    const paymentMethod   = f['Способ оплаты'] || null;

    // Photographer
    const phLinks = f['Фотограф'] || [];
    const phId    = phLinks[0] || null;
    const ph      = phId ? phMap[phId] : null;
    const phName  = ph?.name || null;

    if (!phName || phName.length < 2) { skipped++; continue; }

    const updateFields = [
      status,
      rate, shootDate, shootTime, durationHours,
      location?.slice(0, 300), city?.slice(0, 200),
      notes?.slice(0, 2000),
      ph?.email, ph?.phone, ph?.telegram, ph?.site, ph?.profileUrl,
      shootStyle?.slice(0, 500),
      expenses, sourceSite,
      serviceAmount, serviceCurrency, serviceStatus, paymentMethod,
    ];

    // 1. Update by airtable_id
    const { rowCount: byAt } = await pool.query(`
      UPDATE shoots SET
        status               = $1,
        rate                 = COALESCE($2::numeric, rate),
        shoot_date           = COALESCE($3::date, shoot_date),
        shoot_time           = COALESCE($4::time, shoot_time),
        duration_hours       = COALESCE($5::numeric, duration_hours),
        location             = COALESCE($6, location),
        city                 = COALESCE($7, city),
        notes                = COALESCE($8, notes),
        photographer_email       = COALESCE($9, photographer_email),
        photographer_phone       = COALESCE($10, photographer_phone),
        photographer_telegram    = COALESCE($11, photographer_telegram),
        photographer_site        = COALESCE($12, photographer_site),
        photographer_profile_url = COALESCE($13, photographer_profile_url),
        shoot_style   = COALESCE($14, shoot_style),
        expenses      = COALESCE($15::numeric, expenses),
        source_site   = COALESCE($16, source_site),
        service_amount   = COALESCE($17::numeric, service_amount),
        service_currency = COALESCE($18, service_currency),
        service_status   = COALESCE($19, service_status),
        payment_method   = COALESCE($20, payment_method)
      WHERE airtable_id = $21
    `, [...updateFields, airtableId]);

    if (byAt > 0) { updated++; continue; }

    // 2. Update by name+date (no airtable_id yet) — also set airtable_id
    const { rowCount: byName } = await pool.query(`
      UPDATE shoots SET
        airtable_id          = $1,
        status               = $2,
        rate                 = COALESCE($3::numeric, rate),
        shoot_date           = COALESCE($4::date, shoot_date),
        shoot_time           = COALESCE($5::time, shoot_time),
        duration_hours       = COALESCE($6::numeric, duration_hours),
        location             = COALESCE($7, location),
        city                 = COALESCE($8, city),
        notes                = COALESCE($9, notes),
        photographer_email       = COALESCE($10, photographer_email),
        photographer_phone       = COALESCE($11, photographer_phone),
        photographer_telegram    = COALESCE($12, photographer_telegram),
        photographer_site        = COALESCE($13, photographer_site),
        photographer_profile_url = COALESCE($14, photographer_profile_url),
        shoot_style   = COALESCE($15, shoot_style),
        expenses      = COALESCE($16::numeric, expenses),
        source_site   = COALESCE($17, source_site),
        service_amount   = COALESCE($18::numeric, service_amount),
        service_currency = COALESCE($19, service_currency),
        service_status   = COALESCE($20, service_status),
        payment_method   = COALESCE($21, payment_method)
      WHERE id = (
        SELECT id FROM shoots
        WHERE model_id = $22 AND airtable_id IS NULL
          AND photographer_name ILIKE $23
          AND ($24::date IS NULL OR shoot_date = $24::date)
        LIMIT 1
      )
    `, [airtableId, ...updateFields, modelId, phName, shootDate]);

    if (byName > 0) { updated++; continue; }

    // 3. Insert new
    await pool.query(`
      INSERT INTO shoots
        (model_id, airtable_id, photographer_name, photographer_site, photographer_profile_url,
         photographer_email, photographer_phone, photographer_telegram,
         shoot_date, shoot_time, duration_hours,
         location, city, rate, currency, status, notes,
         shoot_style, expenses, source_site,
         service_amount, service_currency, service_status, payment_method)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'EUR',$15,$16,$17,$18,$19,$20,$21,$22,$23)
    `, [
      modelId, airtableId, phName, ph?.site, ph?.profileUrl,
      ph?.email, ph?.phone, ph?.telegram,
      shootDate, shootTime, durationHours,
      location?.slice(0, 300), city?.slice(0, 200),
      rate, status, notes?.slice(0, 2000),
      shootStyle?.slice(0, 500), expenses, sourceSite,
      serviceAmount, serviceCurrency, serviceStatus, paymentMethod,
    ]);
    inserted++;
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
