import db from './db';

export function initializeSchema(): void {
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

  // ── Migrations ─────────────────────────────────────────────────────────────
  // Safe ALTER TABLE calls — silently ignored if column already exists
  try { db.exec(`ALTER TABLE trips ADD COLUMN cover_position_x REAL DEFAULT 50`); } catch {}
  try { db.exec(`ALTER TABLE trips ADD COLUMN cover_position_y REAL DEFAULT 50`); } catch {}

  console.log('✅ Database schema initialized');
}
