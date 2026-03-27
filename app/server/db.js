const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const migrationsDir = path.join(__dirname, 'migrations');
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const applied = new Set(
      (await client.query('SELECT name FROM _migrations')).rows.map(r => r.name)
    );

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log(`[db] Applying migration: ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${err.message}`);
      }
    }
    console.log('[db] Migrations OK');
  } finally {
    client.release();
  }
}

async function query(sql, params) {
  return pool.query(sql, params);
}

async function one(sql, params) {
  const res = await pool.query(sql, params);
  return res.rows[0] || null;
}

async function all(sql, params) {
  const res = await pool.query(sql, params);
  return res.rows;
}

module.exports = { pool, migrate, query, one, all };
