import fs from 'fs';
import path from 'path';
import db from '../database/db';
import { MEDIA_WORKERS } from '../config';
import { deleteMediaFiles } from './storage';
import { processImage } from './images';
import { createPoster, makePlayable, playbackPlan, probeVideo, uploadPath } from './videos';
import { detectMedia, readHeader, type ImageFormat, type VideoFormat } from './media';
import type { PhotoRow } from '../types';

// ─── Background processing of photos and videos ───────────────────────────────
// Uploads only store the original; everything heavy happens here, a few jobs
// at a time (MEDIA_WORKERS): thumbnails, HEIC/TIFF → JPEG, video posters and
// conversion to H.264. A failed job is retried later (MAX_ATTEMPTS times, with
// a growing pause); pending work survives restarts.

export const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = Number(process.env.MEDIA_RETRY_DELAY_MS) || 60_000;

const waiting: number[] = [];
const queued = new Set<number>();
let running = 0;
let idleWaiters: Array<() => void> = [];

export function enqueueMedia(photoId: number): void {
  if (queued.has(photoId)) return;
  queued.add(photoId);
  waiting.push(photoId);
  pump();
}

function pump() {
  while (running < MEDIA_WORKERS && waiting.length > 0) {
    const id = waiting.shift()!;
    running++;
    processMedia(id)
      .catch((err) => console.error(`Media ${id}:`, (err as Error).message))
      .finally(() => {
        running--;
        queued.delete(id);
        pump();
        if (running === 0 && waiting.length === 0) {
          idleWaiters.forEach((resolve) => resolve());
          idleWaiters = [];
        }
      });
  }
}

/** Resolves when the queue is empty (used by the tests). */
export function mediaQueueIdle(): Promise<void> {
  if (running === 0 && waiting.length === 0) return Promise.resolve();
  return new Promise((resolve) => idleWaiters.push(resolve));
}

export function queueStatus() {
  return { running, waiting: waiting.length };
}

/** A row needs work while it isn't viewable yet or has no thumbnail. */
const PENDING_SQL = `(status = 'processing' OR thumb_filename IS NULL) AND status != 'failed' AND attempts < ${MAX_ATTEMPTS}`;

/** Queues everything still pending (on startup, after a restore…). */
export function resumePendingMedia(): number {
  const rows = db.prepare(`SELECT id FROM photos WHERE ${PENDING_SQL} ORDER BY id`).all() as { id: number }[];
  rows.forEach(({ id }) => enqueueMedia(id));
  return rows.length;
}

const getRow = (id: number) => db.prepare('SELECT * FROM photos WHERE id = ?').get(id) as PhotoRow | undefined;

async function processMedia(id: number): Promise<void> {
  const row = getRow(id);
  if (!row || row.status === 'failed' || row.attempts >= MAX_ATTEMPTS) return;
  if (row.status !== 'processing' && row.thumb_filename) return;

  try {
    const changes = row.media_type === 'image' ? await processPhotoRow(row) : await processVideoRow(row);
    // Deleted while we were working? Then drop what was written.
    if (!getRow(id)) return deleteMediaFiles({ ...row, ...changes });
    db.prepare(`
      UPDATE photos SET status = 'ready', error = NULL, filename = @filename, original_filename = @original_filename,
        thumb_filename = @thumb_filename, width = COALESCE(@width, width), height = COALESCE(@height, height),
        duration = COALESCE(@duration, duration)
      WHERE id = @id
    `).run({ ...row, ...changes, id });
  } catch (err) {
    const message = (err as Error).message.slice(0, 500);
    const attempts = row.attempts + 1;
    // Out of retries: a photo the browser can show anyway stays usable
    const viewable = row.status === 'ready';
    const status = attempts >= MAX_ATTEMPTS && !viewable ? 'failed' : row.status;
    db.prepare('UPDATE photos SET attempts = ?, error = ?, status = ? WHERE id = ?').run(attempts, message, status, id);
    if (attempts < MAX_ATTEMPTS) setTimeout(() => enqueueMedia(id), RETRY_DELAY_MS * attempts).unref();
    throw err;
  }
}

function sourceOf(row: PhotoRow): string {
  return row.original_filename ?? row.filename;
}

async function processPhotoRow(row: PhotoRow): Promise<Partial<PhotoRow>> {
  const source = sourceOf(row);
  const media = detectMedia(readHeader(uploadPath(source)));
  if (media?.kind !== 'image') throw new Error('The stored file is not an image');
  const image = await processImage(source, media.format as ImageFormat);
  return {
    filename: image.filename,
    original_filename: image.original_filename,
    thumb_filename: image.thumb_filename,
    width: image.width,
    height: image.height,
  };
}

async function processVideoRow(row: PhotoRow): Promise<Partial<PhotoRow>> {
  const source = sourceOf(row);
  const input = uploadPath(source);
  const probe = await probeVideo(input);
  const thumb = row.thumb_filename ?? `${path.parse(source).name}.thumb.webp`;
  if (!row.thumb_filename || !fs.existsSync(uploadPath(thumb))) await createPoster(input, probe, uploadPath(thumb));

  if (row.status === 'processing') {
    const format = path.extname(source).slice(1) as VideoFormat;
    const plan = playbackPlan(format, probe);
    await makePlayable(input, uploadPath(row.filename), plan === 'as-is' ? 'remux' : plan, probe);
  }
  return {
    filename: row.filename,
    original_filename: row.original_filename,
    thumb_filename: thumb,
    width: probe.width,
    height: probe.height,
    duration: probe.duration,
  };
}

/** Puts failed (or stuck) items back in the queue with fresh attempts. */
export function retryMedia(ids: number[]): number {
  const reset = db.prepare(`
    UPDATE photos SET attempts = 0, error = NULL,
      status = CASE WHEN status = 'failed' THEN 'processing' ELSE status END
    WHERE id = ? AND (status != 'ready' OR thumb_filename IS NULL OR error IS NOT NULL)
  `);
  let count = 0;
  for (const id of ids) {
    if (reset.run(id).changes) {
      enqueueMedia(id);
      count++;
    }
  }
  return count;
}

