const API_BASE = 'https://api.airtable.com/v0';

const TABLES = {
  shoots: 'Трекер съемок',
  sites: 'Сайты',
  photographers: 'Фотографы'
};

// Per-model Airtable base, API key from env (one account)
let currentBaseId = process.env.AIRTABLE_BASE_ID;

function setAirtableBase(baseId) {
  currentBaseId = baseId;
}

async function airtableFetch(tableName, method = 'GET', body = null, params = '') {
  const token = process.env.AIRTABLE_API_KEY;
  const baseId = currentBaseId;
  if (!token) throw new Error('Missing Airtable API key');
  if (!baseId) throw new Error('Missing Airtable Base ID');

  const url = `${API_BASE}/${baseId}/${encodeURIComponent(tableName)}${params}`;
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable ${method} ${tableName} failed ${res.status}: ${text}`);
  }
  return res.json();
}

// --- Sites ---

async function findOrCreateSite(siteName) {
  // Search existing
  const filter = encodeURIComponent(`{Источник} = "${siteName}"`);
  const data = await airtableFetch(TABLES.sites, 'GET', null, `?filterByFormula=${filter}`);
  if (data.records.length > 0) return data.records[0].id;

  // Create
  const result = await airtableFetch(TABLES.sites, 'POST', {
    records: [{ fields: { 'Источник': siteName } }]
  });
  return result.records[0].id;
}

// --- Photographers ---

async function findOrCreatePhotographer(name, siteRecordId) {
  // Search by name
  const filter = encodeURIComponent(`{Name} = "${name.replace(/"/g, '\\"')}"`);
  const data = await airtableFetch(TABLES.photographers, 'GET', null, `?filterByFormula=${filter}`);
  if (data.records.length > 0) {
    const rec = data.records[0];
    // Link to site if not already linked
    const existingSites = rec.fields['Сайт'] || [];
    if (siteRecordId && !existingSites.includes(siteRecordId)) {
      await airtableFetch(TABLES.photographers, 'PATCH', {
        records: [{
          id: rec.id,
          fields: { 'Сайт': [...existingSites, siteRecordId] }
        }]
      });
    }
    return rec.id;
  }

  // Create
  const fields = { 'Name': name };
  if (siteRecordId) fields['Сайт'] = [siteRecordId];
  const result = await airtableFetch(TABLES.photographers, 'POST', {
    records: [{ fields }]
  });
  return result.records[0].id;
}

// --- Shoots ---

async function createShoot(details) {
  const fields = {};

  if (details.city) fields['Город, страна'] = details.city;
  if (details.location) fields['Локация'] = details.location;
  if (details.style) fields['Стиль съемки'] = details.style;
  if (details.notes) fields['Примечание'] = details.notes;

  // DateTime — Airtable expects ISO 8601
  if (details.startTime) fields['Начало'] = details.startTime;

  // Duration in seconds
  if (details.durationHours) fields['Длительность'] = details.durationHours * 3600;

  // Budget
  if (details.budget) fields['Бюджет'] = details.budget;

  // Expenses (travel etc)
  if (details.expenses) fields['Расходы'] = details.expenses;

  // Status
  fields['Статус фотосессии'] = details.status || 'Резерв';

  // Linked records
  if (details.photographerRecordId) {
    fields['Фотограф'] = [details.photographerRecordId];
  }
  if (details.siteRecordId) {
    fields['Источник'] = [details.siteRecordId];
  }

  const result = await airtableFetch(TABLES.shoots, 'POST', {
    records: [{ fields }]
  });
  return result.records[0];
}

// --- High-level: create shoot from dialog data ---

async function recordShoot(shootDetails) {
  // 1. Find or create site
  const siteRecordId = await findOrCreateSite(shootDetails.siteName);

  // 2. Find or create photographer
  const photographerRecordId = await findOrCreatePhotographer(
    shootDetails.photographer,
    siteRecordId
  );

  // 3. Create shoot record
  const record = await createShoot({
    ...shootDetails,
    siteRecordId,
    photographerRecordId
  });

  console.log(`[airtable] Shoot recorded: ${record.id} — ${shootDetails.photographer}`);
  return record;
}

module.exports = { findOrCreateSite, findOrCreatePhotographer, createShoot, recordShoot, setAirtableBase };
