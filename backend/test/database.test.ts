import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { useTestEnv } from './env';

const env = useTestEnv({ seed: true });

// A database created by the app before migrations were versioned
fs.mkdirSync(env.dataDir, { recursive: true });
const legacyPath = path.join(env.root, 'legacy.db');
const legacy = new Database(legacyPath);
legacy.exec(`
  CREATE TABLE trips (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT DEFAULT '',
    start_date TEXT NOT NULL, end_date TEXT NOT NULL, cover_image TEXT, tags TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now')));
  INSERT INTO trips (title, start_date, end_date) VALUES ('Old trip', '2020-01-01', '2020-01-02');
  INSERT INTO trips (title, start_date, end_date) VALUES ('Future trip', '2999-01-01', '2999-01-02');
`);
// Children that a careless table rebuild would cascade-delete
legacy.pragma('foreign_keys = ON');
legacy.exec(`
  CREATE TABLE locations (id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE, name TEXT NOT NULL, country TEXT DEFAULT '',
    lat REAL NOT NULL, lng REAL NOT NULL, date_start TEXT, date_end TEXT, description TEXT DEFAULT '',
    notes TEXT DEFAULT '', order_index INTEGER DEFAULT 0,
    rating INTEGER CHECK(rating IS NULL OR (rating >= 1 AND rating <= 5)));
  CREATE TABLE photos (id INTEGER PRIMARY KEY AUTOINCREMENT,
    location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE, filename TEXT NOT NULL,
    original_name TEXT NOT NULL DEFAULT '', caption TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')));
  INSERT INTO locations (trip_id, name, lat, lng) VALUES (1, 'Rome', 41.9, 12.5);
  INSERT INTO photos (trip_id, location_id, filename) VALUES (1, 1, 'a.jpg');
`);

const { migrate, SCHEMA_VERSION } = await import('../src/database/migrations');
const { initDatabase } = await import('../src/database');
const { default: db } = await import('../src/database/db');

describe('database', () => {
  it('upgrades a pre-versioning database without losing data or seeding it', () => {
    expect(migrate(legacy)).toBe(false);
    expect(legacy.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
    const row = legacy.prepare('SELECT * FROM trips WHERE id = 1').get() as Record<string, unknown>;
    expect(row).toMatchObject({ title: 'Old trip', cover_position_x: 50, status: 'done', currency: 'EUR' });
    expect(legacy.prepare('SELECT status FROM trips WHERE id = 2').get()).toEqual({ status: 'planned' });
    // Rebuilding the trips table kept its children and their links
    expect(legacy.prepare('SELECT trip_id FROM locations').all()).toEqual([{ trip_id: 1 }]);
    expect(legacy.prepare('SELECT trip_id, location_id FROM photos').all()).toEqual([{ trip_id: 1, location_id: 1 }]);
    expect(legacy.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(legacy.pragma('foreign_key_check')).toEqual([]);
    expect(migrate(legacy)).toBe(false); // idempotent
  });

  it('seeds the demo trips only when the database is created', () => {
    initDatabase();
    const count = () => (db.prepare('SELECT COUNT(*) AS n FROM trips').get() as { n: number }).n;
    expect(count()).toBe(3);

    db.prepare('DELETE FROM trips').run();
    initDatabase(); // e.g. a restart after deleting every trip
    expect(count()).toBe(0);
  });
});
