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
`);

const { migrate, SCHEMA_VERSION } = await import('../src/database/migrations');
const { initDatabase } = await import('../src/database');
const { default: db } = await import('../src/database/db');

describe('database', () => {
  it('upgrades a pre-versioning database without losing data or seeding it', () => {
    expect(migrate(legacy)).toBe(false);
    expect(legacy.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
    const row = legacy.prepare('SELECT * FROM trips').get() as Record<string, unknown>;
    expect(row).toMatchObject({ title: 'Old trip', cover_position_x: 50 });
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
