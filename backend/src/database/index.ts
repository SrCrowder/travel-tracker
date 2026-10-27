import db from './db';
import { migrate } from './migrations';
import { seedDemoData } from './seed';
import { SEED_DEMO } from '../config';

/** Runs migrations and, only for a brand-new database, adds the demo trips. */
export function initDatabase(): void {
  const fresh = migrate(db);
  if (fresh && SEED_DEMO) seedDemoData();
  console.log('✅ Database ready');
}

export { db };
