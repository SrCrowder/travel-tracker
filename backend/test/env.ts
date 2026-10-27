import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Points the app at a fresh temp data/uploads dir. Call it before importing
 * anything from src/ (use dynamic imports), since config is read on import.
 */
export function useTestEnv(options: { password?: string; seed?: boolean } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'travel-tracker-test-'));
  process.env.DATA_DIR = path.join(root, 'data');
  process.env.UPLOADS_DIR = path.join(root, 'uploads');
  process.env.SEED_DEMO = options.seed ? 'true' : 'false';
  if (options.password) process.env.WEB_PASSWORD = options.password;
  else delete process.env.WEB_PASSWORD;
  return { root, uploadsDir: process.env.UPLOADS_DIR, dataDir: process.env.DATA_DIR };
}

// 1×1 PNG
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

export const listUploads = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir) : []);
