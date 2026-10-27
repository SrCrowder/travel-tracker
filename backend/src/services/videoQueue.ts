import db from '../database/db';
import { deleteMediaFiles } from './storage';
import { makePlayable, playbackPlan, probeVideo, uploadPath } from './videos';
import type { PhotoRow } from '../types';
import type { VideoFormat } from './media';

// Videos that need converting are processed one at a time in the background:
// the upload answers right away with status "processing" and the frontend
// polls until it turns "ready" (or "failed").

let queue: Promise<void> = Promise.resolve();

export function enqueueVideo(photoId: number): void {
  queue = queue.then(() => convert(photoId)).catch((err) => {
    console.error(`Video ${photoId}:`, (err as Error).message);
  });
}

/** Resolves when every queued conversion has finished (used by the tests). */
export function videoQueueIdle(): Promise<void> {
  return queue;
}

async function convert(photoId: number): Promise<void> {
  const row = db.prepare('SELECT * FROM photos WHERE id = ?').get(photoId) as PhotoRow | undefined;
  if (!row || row.status !== 'processing' || !row.original_filename) return;

  const setStatus = db.prepare('UPDATE photos SET status = ? WHERE id = ?');
  try {
    const input = uploadPath(row.original_filename);
    const probe = await probeVideo(input);
    const format = row.original_filename.split('.').pop() as VideoFormat;
    const plan = playbackPlan(format, probe);
    await makePlayable(input, uploadPath(row.filename), plan === 'as-is' ? 'remux' : plan, probe);

    // Deleted while converting? Then drop what we just wrote.
    const still = db.prepare('SELECT id FROM photos WHERE id = ?').get(photoId);
    if (!still) return deleteMediaFiles(row);
    setStatus.run('ready', photoId);
  } catch (err) {
    setStatus.run('failed', photoId);
    throw err;
  }
}

/** Re-queues conversions interrupted by a restart. */
export function resumePendingVideos(): number {
  const pending = db.prepare("SELECT id FROM photos WHERE status = 'processing' ORDER BY id").all() as { id: number }[];
  pending.forEach(({ id }) => enqueueVideo(id));
  return pending.length;
}
