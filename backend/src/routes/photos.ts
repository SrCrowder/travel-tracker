import { Router, Request, Response, NextFunction } from 'express';
import db from '../database/db';
import upload, { verifyMedia, removeUploadedFiles, type VerifiedFile } from '../middleware/upload';
import { getLocation, getPhoto, getTripRow, MEDIA_ORDER } from '../database/queries';
import { photoUpdateSchema, photoUploadSchema, validate } from '../validation';
import { ingest, type IngestedMedia } from '../services/ingest';
import { deleteMediaFiles } from '../services/storage';
import { enqueueVideo } from '../services/videoQueue';
import type { PhotoRow } from '../types';

const router = Router({ mergeParams: true });

// ─── GET photos/videos for a trip (optionally filtered by location) ──────────
router.get('/', (req: Request, res: Response) => {
  const { location_id } = req.query;
  const photos = location_id
    ? db.prepare(`SELECT * FROM photos WHERE trip_id = ? AND location_id = ? ORDER BY ${MEDIA_ORDER}`)
      .all(req.params.tripId, String(location_id))
    : db.prepare(`SELECT * FROM photos WHERE trip_id = ? ORDER BY ${MEDIA_ORDER}`).all(req.params.tripId);
  res.json(photos);
});

// ─── POST upload photos and/or videos ────────────────────────────────────────
router.post('/', upload.array('photos', 50), verifyMedia(['image', 'video']), async (req: Request, res: Response, next: NextFunction) => {
  const reject = (status: number, error: string) => {
    removeUploadedFiles(req);
    res.status(status).json({ error });
  };

  if (!getTripRow(req.params.tripId)) return reject(404, 'Trip not found');

  const files = (req.files ?? []) as VerifiedFile[];
  if (files.length === 0) return reject(400, 'No files uploaded');

  const body = validate(photoUploadSchema, req.body, res);
  if (!body) return removeUploadedFiles(req);

  const locationId = body.location_id ?? null;
  if (locationId && !getLocation(req.params.tripId, locationId)) {
    return reject(400, 'Location does not belong to this trip');
  }

  // Process every file first; if one is unreadable the whole upload is rejected
  const ingested: IngestedMedia[] = [];
  try {
    for (const file of files) ingested.push(await ingest(file.filename, file.media));
  } catch (err) {
    ingested.forEach(deleteMediaFiles);
    removeUploadedFiles(req);
    console.error('Could not process upload:', (err as Error).message);
    return res.status(400).json({ error: 'A file could not be read as a photo or video' });
  }

  try {
    const insert = db.prepare(`
      INSERT INTO photos (location_id, trip_id, media_type, status, filename, original_filename, thumb_filename,
        original_name, caption, taken_at, taken_offset, lat, lng, camera, width, height, duration)
      VALUES (@location_id, @trip_id, @media_type, @status, @filename, @original_filename, @thumb_filename,
        @original_name, @caption, @taken_at, @taken_offset, @lat, @lng, @camera, @width, @height, @duration)
    `);
    const ids = db.transaction(() => ingested.map((media, i) => Number(insert.run({
      ...media,
      location_id: locationId,
      trip_id: req.params.tripId,
      original_name: files[i].originalname,
      caption: body.caption,
    }).lastInsertRowid)))();

    ids.forEach((id, i) => { if (ingested[i].status === 'processing') enqueueVideo(id); });
    res.status(201).json(ids.map((id) => db.prepare('SELECT * FROM photos WHERE id = ?').get(id) as PhotoRow));
  } catch (err) {
    ingested.forEach(deleteMediaFiles);
    removeUploadedFiles(req);
    next(err);
  }
});

// ─── PATCH update caption ─────────────────────────────────────────────────────
router.patch('/:photoId', (req: Request, res: Response) => {
  const photo = getPhoto(req.params.tripId, req.params.photoId);
  if (!photo) return res.status(404).json({ error: 'Photo not found' });

  const body = validate(photoUpdateSchema, req.body, res);
  if (!body) return;

  db.prepare('UPDATE photos SET caption = ? WHERE id = ?').run(body.caption, photo.id);
  res.json(getPhoto(req.params.tripId, photo.id));
});

// ─── DELETE photo/video ───────────────────────────────────────────────────────
router.delete('/:photoId', (req: Request, res: Response) => {
  const photo = getPhoto(req.params.tripId, req.params.photoId);
  if (!photo) return res.status(404).json({ error: 'Photo not found' });

  db.prepare('DELETE FROM photos WHERE id = ?').run(photo.id);
  deleteMediaFiles(photo);
  res.json({ message: 'Photo deleted' });
});

export default router;
