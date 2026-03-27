require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const { migrate, one, query } = require('./db');

async function seed() {
  await migrate();

  // Admin
  const adminExists = await one('SELECT id FROM users WHERE email = $1', ['admin@lambertain.agency']);
  if (!adminExists) {
    const hash = await bcrypt.hash('admin123', 10);
    await one(
      `INSERT INTO users (role, name, email, password_hash) VALUES ('admin','Admin','admin@lambertain.agency',$1) RETURNING id`,
      [hash]
    );
    console.log('[seed] Admin created: admin@lambertain.agency / admin123');
  }

  // Models from models/ directory
  const fs = require('fs');
  const path = require('path');
  const modelsDir = path.resolve(__dirname, '../../models');
  const slugs = fs.readdirSync(modelsDir).filter(f =>
    fs.existsSync(path.join(modelsDir, f, 'config.json'))
  );

  for (const slug of slugs) {
    const config = JSON.parse(fs.readFileSync(path.join(modelsDir, slug, 'config.json'), 'utf8'));
    const displayName = config.name || slug;

    const existing = await one(
      `SELECT u.id FROM users u JOIN agency_models am ON am.user_id = u.id WHERE am.slug = $1`,
      [slug]
    );
    if (existing) { console.log(`[seed] Model ${slug} already exists`); continue; }

    const user = await one(
      `INSERT INTO users (role, name) VALUES ('model', $1) RETURNING id`,
      [displayName]
    );
    await query(
      `INSERT INTO agency_models (user_id, slug, display_name) VALUES ($1, $2, $3)`,
      [user.id, slug, displayName]
    );
    console.log(`[seed] Model created: ${slug} (${displayName})`);
  }

  console.log('[seed] Done');
  process.exit(0);
}

seed().catch(err => { console.error('[seed] Error:', err.message); process.exit(1); });
