import { Router, Request, Response, NextFunction } from 'express';
import db from '../database/db';
import upload, { verifyMedia, removeUploadedFiles, type VerifiedFile, type RejectedFile } from '../middleware/upload';
import { getLocation, getPhoto, getTripRow, MEDIA_ORDER } from '../database/queries';
import { photoLocateSchema, photoRetrySchema, photoUpdateSchema, photoUploadSchema, validate } from '../validation';
import { ingest, type IngestedMedia } from '../services/ingest';
import { deleteMediaFiles } from '../services/storage';
import { enqueueMedia, retryMedia } from '../services/mediaJobs';
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
// Each file is judged on its own: the answer lists what was saved and what
// wasn't (with a reason code). Saved files are processed in the background.
router.post('/', upload.array('photos', 50), verifyMedia(['image', 'video'], { partial: true }),
  async (req: Request, res: Response, next: NextFunction) => {
    const failed: RejectedFile[] = [...(req.rejectedFiles ?? [])];
    const reject = (status: number, error: string) => {
      removeUploadedFiles(req);
      res.status(status).json({ error, photos: [], failed });
    };

    if (!getTripRow(req.params.tripId)) return reject(404, 'Trip not found');

    const files = (req.files ?? []) as VerifiedFile[];
    if (files.length === 0) return reject(400, failed.length ? 'No file could be accepted' : 'No files uploaded');

    const body = validate(photoUploadSchema, req.body, res);
    if (!body) return removeUploadedFiles(req);

    const locationId = body.location_id ?? null;
    if (locationId && !getLocation(req.params.tripId, locationId)) {
      return reject(400, 'Location does not belong to this trip');
    }

    try {
      const insert = db.prepare(`
        INSERT INTO photos (location_id, trip_id, media_type, status, filename, original_filename, thumb_filename,
          original_name, caption, taken_at, taken_offset, lat, lng, camera, width, height, duration, geo_source)
        VALUES (@location_id, @trip_id, @media_type, @status, @filename, @original_filename, @thumb_filename,
          @original_name, @caption, @taken_at, @taken_offset, @lat, @lng, @camera, @width, @height, @duration, @geo_source)
      `);
      const ingested: IngestedMedia[] = [];
      for (const file of files) ingested.push(await ingest(file.filename, file.media));
      const ids = db.transaction(() => ingested.map((media, i) => Number(insert.run({
        ...media,
        location_id: locationId,
        trip_id: req.params.tripId,
        original_name: files[i].originalname,
        caption: body.caption,
      }).lastInsertRowid)))();

      ids.forEach(enqueueMedia);
      res.status(201).json({
        photos: ids.map((id) => db.prepare('SELECT * FROM photos WHERE id = ?').get(id) as PhotoRow),
        failed,
      });
    } catch (err) {
      removeUploadedFiles(req);
      next(err);
    }
  });

// ─── PATCH place several photos/videos on the map at once ────────────────────
router.patch('/', (req: Request, res: Response) => {
  if (!getTripRow(req.params.tripId)) return res.status(404).json({ error: 'Trip not found' });
  const body = validate(photoLocateSchema, req.body, res);
  if (!body) return;
  if (body.location_id && !getLocation(req.params.tripId, body.location_id)) {
    return res.status(400).json({ error: 'Location does not belong to this trip' });
  }

  const setPosition = db.prepare(`
    UPDATE photos SET lat = @lat, lng = @lng, geo_source = @geo_source
    WHERE id = @id AND trip_id = @trip_id
  `);
  const setLocation = db.prepare('UPDATE photos SET location_id = ? WHERE id = ? AND trip_id = ?');
  const updated = db.transaction(() => body.ids.reduce((count, id) => {
    const changes = setPosition.run({
      id, trip_id: req.params.tripId, lat: body.lat, lng: body.lng,
      geo_source: body.lat === null ? null : body.geo_source,
    }).changes;
    if (body.location_id !== undefined) setLocation.run(body.location_id, id, req.params.tripId);
    return count + changes;
  }, 0))();
  res.json({ updated });
});

// ─── POST retry the background processing of failed items ────────────────────
router.post('/retry', (req: Request, res: Response) => {
  const body = validate(photoRetrySchema, req.body, res);
  if (!body) return;
  const ids = body.ids ?? (db.prepare(
    "SELECT id FROM photos WHERE trip_id = ? AND (status = 'failed' OR error IS NOT NULL)"
  ).all(req.params.tripId) as { id: number }[]).map((r) => r.id);
  const inTrip = ids.filter((id) => getPhoto(req.params.tripId, id));
  res.json({ queued: retryMedia(inTrip) });
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
