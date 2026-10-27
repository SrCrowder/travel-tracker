import type { Database } from 'better-sqlite3';

// ─── Versioned migrations ─────────────────────────────────────────────────────
// Each entry runs once, in order, inside a transaction; PRAGMA user_version
// stores how many have been applied. Never edit an entry that has shipped —
// append a new one instead.

function hasColumn(db: Database, table: string, column: string): boolean {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[])
    .some((c) => c.name === column);
}

const migrations: Array<(db: Database) => void> = [
  // 1 — baseline. Idempotent because databases created before versioning
  //     already have these tables (and maybe the cover position columns).
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS trips (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        title       TEXT    NOT NULL,
        description TEXT    DEFAULT '',
        start_date  TEXT    NOT NULL,
        end_date    TEXT    NOT NULL,
        cover_image TEXT,
        tags        TEXT    DEFAULT '[]',
        created_at  TEXT    DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS locations (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        trip_id     INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        name        TEXT    NOT NULL,
        country     TEXT    DEFAULT '',
        lat         REAL    NOT NULL,
        lng         REAL    NOT NULL,
        date_start  TEXT,
        date_end    TEXT,
        description TEXT    DEFAULT '',
        notes       TEXT    DEFAULT '',
        order_index INTEGER DEFAULT 0,
        rating      INTEGER CHECK(rating IS NULL OR (rating >= 1 AND rating <= 5))
      );

      CREATE TABLE IF NOT EXISTS photos (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        location_id   INTEGER REFERENCES locations(id) ON DELETE SET NULL,
        trip_id       INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        filename      TEXT    NOT NULL,
        original_name TEXT    NOT NULL DEFAULT '',
        caption       TEXT    DEFAULT '',
        created_at    TEXT    DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_locations_trip_id    ON locations(trip_id);
      CREATE INDEX IF NOT EXISTS idx_photos_trip_id       ON photos(trip_id);
      CREATE INDEX IF NOT EXISTS idx_photos_location_id   ON photos(location_id);
      CREATE INDEX IF NOT EXISTS idx_trips_start_date     ON trips(start_date);
    `);
    if (!hasColumn(db, 'trips', 'cover_position_x')) db.exec('ALTER TABLE trips ADD COLUMN cover_position_x REAL DEFAULT 50');
    if (!hasColumn(db, 'trips', 'cover_position_y')) db.exec('ALTER TABLE trips ADD COLUMN cover_position_y REAL DEFAULT 50');
  },

  // 2 — photos become "media": metadata from EXIF / video tags, thumbnails,
  //     an untouched original next to the browser-friendly copy, and videos
  //     (converted in the background: status processing → ready / failed).
  (db) => {
    db.exec(`
      ALTER TABLE photos ADD COLUMN media_type TEXT NOT NULL DEFAULT 'image';
      ALTER TABLE photos ADD COLUMN status TEXT NOT NULL DEFAULT 'ready';
      ALTER TABLE photos ADD COLUMN original_filename TEXT;
      ALTER TABLE photos ADD COLUMN thumb_filename TEXT;
      ALTER TABLE photos ADD COLUMN taken_at TEXT;
      ALTER TABLE photos ADD COLUMN taken_offset TEXT;
      ALTER TABLE photos ADD COLUMN lat REAL;
      ALTER TABLE photos ADD COLUMN lng REAL;
      ALTER TABLE photos ADD COLUMN camera TEXT;
      ALTER TABLE photos ADD COLUMN width INTEGER;
      ALTER TABLE photos ADD COLUMN height INTEGER;
      ALTER TABLE photos ADD COLUMN duration REAL;
      CREATE INDEX IF NOT EXISTS idx_photos_taken_at ON photos(trip_id, taken_at);
    `);
  },
];

export const SCHEMA_VERSION = migrations.length;

/** Brings the schema up to date. Returns true if the database was brand new. */
export function migrate(db: Database): boolean {
  const fresh = !db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'trips'").get();
  const current = db.pragma('user_version', { simple: true }) as number;
  if (current > migrations.length) {
    throw new Error(`Database schema v${current} is newer than this app (v${migrations.length})`);
  }
  for (let v = current; v < migrations.length; v++) {
    db.transaction(() => {
      migrations[v](db);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
  return fresh;
}
