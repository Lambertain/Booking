require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { migrate, one, query, all } = require('./db');

const USERS = [
  // Admin
  { role: 'admin', name: 'Nikita Solovey', telegram_id: 157915571, telegram_username: 'soloveynik' },
  // Model + admin partner (ana-v)
  { role: 'model', name: 'Morning', telegram_id: 581109533, telegram_username: 'the_morning_st',
    slug: 'ana-v', display_name: 'Ana V' },
  // Other models (no telegram yet — added when they /start the bot)
  { role: 'model', name: 'Kisa',          slug: 'kisa',          display_name: 'Kisa' },
  { role: 'model', name: 'Victoria Polly',slug: 'victoria-polly',display_name: 'Victoria Polly' },
  { role: 'model', name: 'Violet Spes',   slug: 'violet-spes',   display_name: 'Violet Spes' },
];

async function seedUsers() {
  const modelMap = {}; // slug → user_id

  for (const u of USERS) {
    // Check if already exists
    const existing = u.telegram_id
      ? await one('SELECT id FROM users WHERE telegram_id = $1', [u.telegram_id])
      : await one('SELECT u.id FROM users u JOIN agency_models am ON am.user_id = u.id WHERE am.slug = $1', [u.slug]);

    if (existing) {
      console.log(`[seed] Already exists: ${u.name}`);
      if (u.slug) modelMap[u.slug] = existing.id;
      continue;
    }

    const user = await one(
      `INSERT INTO users (role, name, telegram_id, telegram_username)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [u.role, u.name, u.telegram_id || null, u.telegram_username || null]
    );
    console.log(`[seed] Created user: ${u.name} (${u.role}) id=${user.id}`);

    if (u.role === 'model') {
      await query(
        `INSERT INTO agency_models (user_id, slug, display_name) VALUES ($1,$2,$3)
         ON CONFLICT (slug) DO UPDATE SET user_id=$1, display_name=$3`,
        [user.id, u.slug, u.display_name]
      );
      modelMap[u.slug] = user.id;
    }
  }

  return modelMap;
}

async function seedShoots(modelMap) {
  const fs = require('fs');
  const path = require('path');
  const shootsFile = path.join(__dirname, '../scripts/airtable-shoots.json');
  if (!fs.existsSync(shootsFile)) {
    console.log('[seed] No airtable-shoots.json found, skipping shoots');
    return;
  }

  const shoots = JSON.parse(fs.readFileSync(shootsFile, 'utf8'));
  let inserted = 0, skipped = 0;

  for (const s of shoots) {
    const modelId = modelMap[s.modelSlug];
    if (!modelId) { skipped++; continue; }
    if (!s.photographerName || s.photographerName === '—') { skipped++; continue; }

    await query(
      `INSERT INTO shoots (model_id, photographer_name, shoot_date, location, rate, currency, status, notes, synced_from_bot_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
      [modelId, s.photographerName, s.shootDate || null, s.location || null,
       s.rate || null, s.currency || 'EUR', s.status || 'confirmed', s.notes || null]
    );
    inserted++;
  }

  console.log(`[seed] Shoots: ${inserted} inserted, ${skipped} skipped`);
}

async function main() {
  await migrate();
  const modelMap = await seedUsers();

  // Fill in any models already in agency_models not in modelMap
  const existing = await all('SELECT am.slug, am.user_id FROM agency_models am', []);
  for (const r of existing) {
    if (!modelMap[r.slug]) modelMap[r.slug] = r.user_id;
  }

  await seedShoots(modelMap);
  console.log('[seed] Done');
  process.exit(0);
}

main().catch(err => { console.error('[seed] Error:', err.message); process.exit(1); });
