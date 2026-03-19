const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.resolve(__dirname, '../../data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'booking.db');
const db = new Database(DB_PATH);

// WAL mode for better concurrent read/write
db.pragma('journal_mode = WAL');

// --- Schema ---
db.exec(`
  CREATE TABLE IF NOT EXISTS dialogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site TEXT NOT NULL,
    url TEXT NOT NULL,
    photographer TEXT DEFAULT '',
    model_slug TEXT NOT NULL,
    status TEXT DEFAULT 'new',
    last_incoming TEXT DEFAULT '',
    msg_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(site, url)
  );
  CREATE INDEX IF NOT EXISTS idx_dialogs_status ON dialogs(model_slug, status);
`);

// --- Prepared statements ---
const stmts = {
  upsert: db.prepare(`
    INSERT INTO dialogs (site, url, photographer, model_slug, status, last_incoming, msg_count, updated_at)
    VALUES (@site, @url, @photographer, @modelSlug, @status, @lastIncoming, @msgCount, datetime('now'))
    ON CONFLICT(site, url) DO UPDATE SET
      photographer = @photographer,
      last_incoming = @lastIncoming,
      msg_count = @msgCount,
      status = @status,
      updated_at = datetime('now')
  `),

  getByUrl: db.prepare('SELECT * FROM dialogs WHERE site = ? AND url = ?'),

  getActive: db.prepare(`
    SELECT * FROM dialogs WHERE model_slug = ? AND status IN ('queued', 'sent')
  `),

  updateStatus: db.prepare(`
    UPDATE dialogs SET status = ?, updated_at = datetime('now') WHERE site = ? AND url = ?
  `),

  updatePhotographer: db.prepare(`
    UPDATE dialogs SET photographer = ?, updated_at = datetime('now') WHERE site = ? AND url = ?
  `)
};

// --- Public API ---

/**
 * Get dialog by site + url. Returns row or undefined.
 */
function getDialog(site, url) {
  return stmts.getByUrl.get(site, url);
}

/**
 * Upsert dialog — create or update.
 */
function upsertDialog({ site, url, photographer, modelSlug, status, lastIncoming, msgCount }) {
  return stmts.upsert.run({
    site, url,
    photographer: photographer || '',
    modelSlug,
    status: status || 'new',
    lastIncoming: lastIncoming || '',
    msgCount: msgCount || 0
  });
}

/**
 * Get all active dialogs (queued or sent) for a model.
 * These need to be checked every scan.
 */
function getActiveDialogs(modelSlug) {
  return stmts.getActive.all(modelSlug);
}

/**
 * Update dialog status.
 */
function updateStatus(site, url, status) {
  return stmts.updateStatus.run(status, site, url);
}

/**
 * Update photographer name (if extraction improved).
 */
function updatePhotographer(site, url, photographer) {
  return stmts.updatePhotographer.run(photographer, site, url);
}

// --- Migration: import existing JSON data ---
function migrateFromJson(modelSlug) {
  const processedPath = path.join(DATA_DIR, modelSlug, 'processed', 'processed-ids.json');
  const activePath = path.join(DATA_DIR, modelSlug, 'processed', 'active-dialogs.json');

  let migrated = 0;

  // Import processed-ids.json
  if (fs.existsSync(processedPath)) {
    try {
      const processed = JSON.parse(fs.readFileSync(processedPath, 'utf8'));
      if (!Array.isArray(processed)) {
        const insertMany = db.transaction((entries) => {
          for (const [key, val] of entries) {
            // Old format: "site::photographer::url" or new: "site::url"
            const parts = key.split('::');
            let site, url;
            if (parts.length === 3) {
              site = parts[0]; url = parts[2];
            } else if (parts.length === 2) {
              site = parts[0]; url = parts[1];
            } else continue;

            const existing = stmts.getByUrl.get(site, url);
            if (!existing) {
              stmts.upsert.run({
                site, url, photographer: '', modelSlug,
                status: 'processed',
                lastIncoming: val.lastIncoming || '',
                msgCount: val.msgCount || 0
              });
              migrated++;
            }
          }
        });
        insertMany(Object.entries(processed));
      }
      // Rename to .bak so we don't re-migrate
      fs.renameSync(processedPath, processedPath + '.bak');
      console.log(`[db] Migrated ${migrated} entries from processed-ids.json (${modelSlug})`);
    } catch (err) {
      console.error(`[db] Migration error (processed): ${err.message}`);
    }
  }

  // Import active-dialogs.json
  if (fs.existsSync(activePath)) {
    try {
      const active = JSON.parse(fs.readFileSync(activePath, 'utf8'));
      let activeMigrated = 0;
      const insertActive = db.transaction((dialogs) => {
        for (const d of dialogs) {
          const existing = stmts.getByUrl.get(d.site, d.url);
          if (existing) {
            stmts.updateStatus.run('sent', d.site, d.url);
          } else {
            stmts.upsert.run({
              site: d.site, url: d.url,
              photographer: d.photographer || '',
              modelSlug,
              status: 'sent',
              lastIncoming: '', msgCount: 0
            });
          }
          activeMigrated++;
        }
      });
      insertActive(active);
      fs.renameSync(activePath, activePath + '.bak');
      console.log(`[db] Migrated ${activeMigrated} active dialogs (${modelSlug})`);
    } catch (err) {
      console.error(`[db] Migration error (active): ${err.message}`);
    }
  }
}

module.exports = {
  db, getDialog, upsertDialog, getActiveDialogs,
  updateStatus, updatePhotographer, migrateFromJson
};
