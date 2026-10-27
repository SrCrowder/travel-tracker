import { Router, Request, Response, NextFunction } from 'express';
import db from '../database/db';
import upload, { verifyMedia, removeUploadedFiles, deleteUpload, type VerifiedFile } from '../middleware/upload';
import { processImage } from '../services/images';
import { deleteMediaFiles } from '../services/storage';
import type { ImageFormat } from '../services/media';
import { getTrip, getTripRow, listTrips } from '../database/queries';
import { tripCreateSchema, tripUpdateSchema, validate } from '../validation';
import type { PhotoRow } from '../types';
import { z } from 'zod';

const router = Router();

type NewLocation = z.output<typeof tripCreateSchema>['new_locations'][number];

function insertLocations(tripId: number | bigint, locations: NewLocation[], firstIndex: number) {
  const insertLocation = db.prepare(`
    INSERT INTO locations (trip_id, name, country, lat, lng, date_start, date_end, description, notes, order_index, rating)
    VALUES (@trip_id, @name, @country, @lat, @lng, @date_start, @date_end, @description, @notes, @order_index, @rating)
  `);
  locations.forEach((loc, i) => insertLocation.run({
    trip_id: tripId,
    name: loc.name,
    country: loc.country,
    lat: loc.lat,
    lng: loc.lng,
    date_start: loc.date_start ?? null,
    date_end: loc.date_end ?? null,
    description: loc.description,
    notes: loc.notes,
    order_index: firstIndex + i,
    rating: loc.rating ?? null,
  }));
}

const BROWSER_IMAGE_FORMATS = ['jpg', 'png', 'gif', 'webp', 'avif'];

/**
 * The cover is shown as-is, so formats browsers can't display (HEIC, TIFF)
 * are replaced by their JPEG version. Returns the filename to store.
 */
async function prepareCover(req: Request): Promise<string | null> {
  const file = req.file as VerifiedFile | undefined;
  if (!file) return null;
  if (BROWSER_IMAGE_FORMATS.includes(file.media.format)) return file.filename;
  const image = await processImage(file.filename, file.media.format as ImageFormat);
  deleteUpload(image.thumb_filename);
  deleteUpload(file.filename);
  return image.filename;
}

// Renumbers order_index 0..n-1, keeping the current order
function compactOrder(tripId: number | string) {
  const ids = db.prepare('SELECT id FROM locations WHERE trip_id = ? ORDER BY order_index, id')
    .all(tripId) as { id: number }[];
  const update = db.prepare('UPDATE locations SET order_index = ? WHERE id = ?');
  ids.forEach(({ id }, i) => update.run(i, id));
}

// ─── GET all trips (with location summaries) ────────────────────────────────
router.get('/', (_req: Request, res: Response) => {
  res.json(listTrips());
});

// ─── GET single trip (with locations + photos) ───────────────────────────────
router.get('/:id', (req: Request, res: Response) => {
  const trip = getTrip(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  res.json(trip);
});

// ─── POST create trip (and its first locations, atomically) ─────────────────
router.post('/', upload.single('cover_image'), verifyMedia(['image']), async (req: Request, res: Response, next: NextFunction) => {
  const body = validate(tripCreateSchema, req.body, res);
  if (!body) return removeUploadedFiles(req);

  let cover: string | null = null;
  try {
    cover = await prepareCover(req);
    const tripId = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO trips (title, description, start_date, end_date, cover_image, tags, cover_position_x, cover_position_y)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(body.title, body.description, body.start_date, body.end_date, cover,
        JSON.stringify(body.tags), body.cover_position_x, body.cover_position_y);
      insertLocations(result.lastInsertRowid, body.new_locations, 0);
      return result.lastInsertRowid;
    })();
    res.status(201).json(getTrip(Number(tripId)));
  } catch (err) {
    removeUploadedFiles(req);
    deleteUpload(cover);
    next(err);
  }
});

// ─── PUT update trip (plus added/removed locations, atomically) ─────────────
router.put('/:id', upload.single('cover_image'), verifyMedia(['image']), async (req: Request, res: Response, next: NextFunction) => {
  const existing = getTripRow(req.params.id);
  if (!existing) {
    removeUploadedFiles(req);
    return res.status(404).json({ error: 'Trip not found' });
  }

  const body = validate(tripUpdateSchema, req.body, res);
  if (!body) return removeUploadedFiles(req);

  const startDate = body.start_date ?? existing.start_date;
  const endDate = body.end_date ?? existing.end_date;
  if (endDate < startDate) {
    removeUploadedFiles(req);
    return res.status(400).json({ error: 'Invalid data', details: ['end_date: must not be before start_date'] });
  }

  let newCover: string | null = null;
  try {
    newCover = await prepareCover(req);
  } catch (err) {
    removeUploadedFiles(req);
    return next(err);
  }
  const replacingCover = !!newCover || body.remove_cover === true;
  const coverImage = newCover ?? (body.remove_cover ? null : existing.cover_image);

  try {
    db.transaction(() => {
      db.prepare(`
        UPDATE trips
        SET title = ?, description = ?, start_date = ?, end_date = ?, cover_image = ?, tags = ?,
            cover_position_x = ?, cover_position_y = ?
        WHERE id = ?
      `).run(
        body.title ?? existing.title,
        body.description ?? existing.description,
        startDate,
        endDate,
        coverImage,
        body.tags ? JSON.stringify(body.tags) : existing.tags,
        body.cover_position_x ?? existing.cover_position_x ?? 50,
        body.cover_position_y ?? existing.cover_position_y ?? 50,
        existing.id,
      );

      const remove = db.prepare('DELETE FROM locations WHERE id = ? AND trip_id = ?');
      body.removed_location_ids.forEach((locId) => remove.run(locId, existing.id));

      const { next } = db.prepare(
        'SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM locations WHERE trip_id = ?'
      ).get(existing.id) as { next: number };
      insertLocations(existing.id, body.new_locations, next);
      compactOrder(existing.id);
    })();
  } catch (err) {
    removeUploadedFiles(req);
    deleteUpload(newCover);
    return next(err);
  }

  // Only touch the disk once the database change is committed
  if (replacingCover && existing.cover_image !== coverImage) deleteUpload(existing.cover_image);
  res.json(getTrip(existing.id));
});

// ─── DELETE trip ─────────────────────────────────────────────────────────────
router.delete('/:id', (req: Request, res: Response) => {
  const trip = getTripRow(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });

  const photos = db.prepare('SELECT filename, original_filename, thumb_filename FROM photos WHERE trip_id = ?')
    .all(trip.id) as Pick<PhotoRow, 'filename' | 'original_filename' | 'thumb_filename'>[];
  db.prepare('DELETE FROM trips WHERE id = ?').run(trip.id);

  photos.forEach(deleteMediaFiles);
  deleteUpload(trip.cover_image);
  res.json({ message: 'Trip deleted successfully' });
});

export default router;
