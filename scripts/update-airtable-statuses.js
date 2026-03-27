/**
 * Update past shoots in Airtable → set status to "Реализована"
 * Skips: Отменена фотографом, Отменена моделью, Отменена агентством
 * Usage: node scripts/update-airtable-statuses.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const AT_TOKEN = process.env.AIRTABLE_API_KEY;

const BASES = [
  { name: 'victoria-polly', baseId: 'appiM4XhlAOlOafvs' },
  { name: 'kisa',           baseId: 'appUU9lOKDhRSddyQ' },
  { name: 'ana-v',          baseId: 'appZ2bwcCZxdQ93Zu' },
  { name: 'violet-spes',    baseId: 'apptpDSywL3IuQqNW' },
];

const TABLE_SHOOTS = 'tblZbs1N8UApi3W60';

const CANCELLED = new Set([
  'Отменена фотографом',
  'Отменена моделью',
  'Отменена агентством',
  'cancelled_photographer',
  'cancelled_model',
  'cancelled_agency',
  'cancelled',
]);

const TODAY = new Date().toISOString().slice(0, 10);

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

async function atPatchBatch(baseId, tableId, records) {
  // Airtable allows max 10 records per PATCH
  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10);
    const res = await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${AT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ records: batch }),
    });
    if (!res.ok) { const t = await res.text(); throw new Error(`AT PATCH ${res.status}: ${t.slice(0,200)}`); }
    // Small delay to avoid rate limit
    await new Promise(r => setTimeout(r, 200));
  }
}

async function processBase({ name, baseId }) {
  console.log(`\n=== ${name} (${baseId}) ===`);
  const shoots = await atGetAll(baseId, TABLE_SHOOTS);
  console.log(`  Total records: ${shoots.length}`);

  const toUpdate = [];
  for (const r of shoots) {
    const f = r.fields;
    const status = f['Статус фотосессии'];
    const dateStr = f['Начало'];
    if (!status || !dateStr) continue;
    if (CANCELLED.has(status)) continue;
    if (status === 'Реализована') continue;

    const date = dateStr.slice(0, 10);
    if (date >= TODAY) continue;

    toUpdate.push({ id: r.id, fields: { 'Статус фотосессии': 'Реализована' } });
  }

  console.log(`  To update → Реализована: ${toUpdate.length}`);
  if (toUpdate.length > 0) {
    await atPatchBatch(baseId, TABLE_SHOOTS, toUpdate);
    console.log(`  ✓ Done`);
  }
}

async function main() {
  if (!AT_TOKEN) { console.error('AIRTABLE_API_KEY not set'); process.exit(1); }
  for (const base of BASES) {
    await processBase(base);
  }
  console.log('\n✓ All done');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
