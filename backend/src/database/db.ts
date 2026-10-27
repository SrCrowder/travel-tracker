import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { DATA_DIR } from '../config';

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'travel.db'));

// Performance optimizations
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('temp_store = MEMORY');
db.pragma('cache_size = -32000'); // 32MB cache

export default db;
