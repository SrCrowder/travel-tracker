import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export const DATA_DIR = path.join(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'travel.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Performance optimizations
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('temp_store = MEMORY');
db.pragma('cache_size = -32000'); // 32MB cache

export default db;
