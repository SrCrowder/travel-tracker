import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import archiver from 'archiver';
import yauzl from 'yauzl';
import Database from 'better-sqlite3';
import db from '../database/db';
import { migrate } from '../database/migrations';
import { DATA_DIR, UPLOADS_DIR } from '../config';
import { resumePendingVideos } from '../services/videoQueue';

// ─── Backup = one ZIP: travel.db (consistent snapshot) + uploads/ ────────────
const router = Router();

// Tables restored, parents first
const TABLES = ['trips', 'locations', 'photos', 'expenses', 'tracks'];
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  const snapshot = path.join(DATA_DIR, `backup-${crypto.randomUUID()}.db`);
  try {
    await db.backup(snapshot); // safe while the app keeps writing
  } catch (err) {
    fs.rmSync(snapshot, { force: true });
    return next(err);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  res.attachment(`travel-tracker-backup-${stamp}.zip`);
  // Photos and videos are already compressed: store them as they are
  const archive = archiver('zip', { store: true });
  const cleanup = () => fs.rmSync(snapshot, { force: true });
  archive.on('error', (err) => { cleanup(); res.destroy(err); });
  res.on('close', cleanup);
  archive.pipe(res);
  archive.file(snapshot, { name: 'travel.db' });
  archive.directory(UPLOADS_DIR, 'uploads');
  await archive.finalize();
});

// ─── Restore ──────────────────────────────────────────────────────────────────
const restoreUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, DATA_DIR),
    filename: (_req, _file, cb) => cb(null, `restore-${crypto.randomUUID()}.zip`),
  }),
  limits: { files: 1 },
});

/** Extracts only travel.db and uploads/<plain file name>; anything else is ignored. */
function extract(zipPath: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error('Not a ZIP file'));
      zip.on('error', reject);
      zip.on('end', () => resolve());
      zip.on('entry', (entry: yauzl.Entry) => {
        const name = entry.fileName;
        const base = path.posix.basename(name);
        const target = name === 'travel.db' ? path.join(dest, 'travel.db')
          : name === `uploads/${base}` && SAFE_NAME.test(base) ? path.join(dest, 'uploads', base)
            : null;
        if (!target) return zip.readEntry();
        zip.openReadStream(entry, (streamErr, stream) => {
          if (streamErr || !stream) return reject(streamErr);
          const out = fs.createWriteStream(target);
          out.on('error', reject);
          out.on('finish', () => zip.readEntry());
          stream.pipe(out);
        });
      });
      fs.mkdirSync(path.join(dest, 'uploads'), { recursive: true });
      zip.readEntry();
    });
  });
}

let restoring = false;

router.post('/restore', restoreUpload.single('backup'), async (req: Request, res: Response, next: NextFunction) => {
  const zipPath = req.file?.path;
  const workDir = path.join(DATA_DIR, `restore-${crypto.randomUUID()}`);
  const cleanup = () => {
    if (zipPath) fs.rmSync(zipPath, { force: true });
    fs.rmSync(workDir, { recursive: true, force: true });
  };
  if (!zipPath) return res.status(400).json({ error: 'No backup file uploaded' });
  if (restoring) {
    cleanup();
    return res.status(409).json({ error: 'A restore is already running' });
  }

  restoring = true;
  try {
    try {
      await extract(zipPath, workDir);
    } catch {
      return res.status(400).json({ error: 'The file is not a valid backup (ZIP)' });
    }

    const backupDbPath = path.join(workDir, 'travel.db');
    if (!fs.existsSync(backupDbPath)) return res.status(400).json({ error: 'The backup has no travel.db' });

    // Bring the backup up to this app's schema, in its own copy
    let backupDb: Database.Database;
    try {
      backupDb = new Database(backupDbPath);
      if (!backupDb.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'trips'").get()) {
        throw new Error('no trips table');
      }
      migrate(backupDb);
      backupDb.close();
    } catch {
      return res.status(400).json({ error: 'The backup database is not valid' });
    }

    // Keep the current database next to the data, in case this was a mistake
    const safety = path.join(DATA_DIR, `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
    await db.backup(safety);

    // Replace every row, using the column names of this database
    db.prepare('ATTACH DATABASE ? AS bk').run(backupDbPath);
    db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        for (const table of [...TABLES].reverse()) db.prepare(`DELETE FROM main.${table}`).run();
        for (const table of TABLES) {
          const cols = (db.prepare(`PRAGMA main.table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
          const list = cols.map((c) => `"${c}"`).join(', ');
          db.prepare(`INSERT INTO main.${table} (${list}) SELECT ${list} FROM bk.${table}`).run();
        }
        const problems = db.pragma('foreign_key_check') as unknown[];
        if (problems.length) throw new Error('The backup has broken references');
      })();
    } finally {
      db.pragma('foreign_keys = ON');
      db.prepare('DETACH DATABASE bk').run();
    }

    // Files: add/overwrite; nothing already on disk is deleted
    const files = fs.readdirSync(path.join(workDir, 'uploads'));
    for (const file of files) {
      const from = path.join(workDir, 'uploads', file);
      const to = path.join(UPLOADS_DIR, file);
      try {
        fs.renameSync(from, to);
      } catch {
        fs.copyFileSync(from, to); // different filesystem
      }
    }

    resumePendingVideos();
    const counts = Object.fromEntries(TABLES.map((t) => [t,
      (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n]));
    res.json({ message: 'Backup restored', files: files.length, ...counts, previous_database: path.basename(safety) });
  } catch (err) {
    next(err);
  } finally {
    restoring = false;
    cleanup();
  }
});

export default router;
