import { Router, Request, Response } from 'express';
import db from '../database/db';
import upload, { verifyImages, removeUploadedFiles, deleteUpload } from '../middleware/upload';
import { getLocation, getPhoto, getTripRow } from '../database/queries';
import { photoUpdateSchema, photoUploadSchema, validate } from '../validation';
import type { PhotoRow } from '../types';

const router = Router({ mergeParams: true });

// ─── GET photos for a trip (optionally filtered by location) ─────────────────
router.get('/', (req: Request, res: Response) => {
  const { location_id } = req.query;
  const photos = location_id
    ? db.prepare('SELECT * FROM photos WHERE trip_id = ? AND location_id = ? ORDER BY created_at, id')
      .all(req.params.tripId, String(location_id))
    : db.prepare('SELECT * FROM photos WHERE trip_id = ? ORDER BY created_at, id').all(req.params.tripId);
  res.json(photos);
});

// ─── POST upload photos ───────────────────────────────────────────────────────
router.post('/', upload.array('photos', 20), verifyImages, (req: Request, res: Response) => {
  const reject = (status: number, error: string) => {
    removeUploadedFiles(req);
    res.status(status).json({ error });
  };

  if (!getTripRow(req.params.tripId)) return reject(404, 'Trip not found');

  const files = (req.files ?? []) as Express.Multer.File[];
  if (files.length === 0) return reject(400, 'No files uploaded');

  const body = validate(photoUploadSchema, req.body, res);
  if (!body) return removeUploadedFiles(req);

  const locationId = body.location_id ?? null;
  if (locationId && !getLocation(req.params.tripId, locationId)) {
    return reject(400, 'Location does not belong to this trip');
  }

  const insert = db.prepare(`
    INSERT INTO photos (location_id, trip_id, filename, original_name, caption)
    VALUES (?, ?, ?, ?, ?)
  `);
  try {
    const ids = db.transaction(() =>
      files.map((file) =>
        insert.run(locationId, req.params.tripId, file.filename, file.originalname, body.caption).lastInsertRowid)
    )();
    res.status(201).json(ids.map((id) => db.prepare('SELECT * FROM photos WHERE id = ?').get(id) as PhotoRow));
  } catch (err) {
    removeUploadedFiles(req);
    throw err;
  }
});

// ─── PATCH update photo caption ───────────────────────────────────────────────
router.patch('/:photoId', (req: Request, res: Response) => {
  const photo = getPhoto(req.params.tripId, req.params.photoId);
  if (!photo) return res.status(404).json({ error: 'Photo not found' });

  const body = validate(photoUpdateSchema, req.body, res);
  if (!body) return;

  db.prepare('UPDATE photos SET caption = ? WHERE id = ?').run(body.caption, photo.id);
  res.json(getPhoto(req.params.tripId, photo.id));
});

// ─── DELETE photo ─────────────────────────────────────────────────────────────
router.delete('/:photoId', (req: Request, res: Response) => {
  const photo = getPhoto(req.params.tripId, req.params.photoId);
  if (!photo) return res.status(404).json({ error: 'Photo not found' });

  db.prepare('DELETE FROM photos WHERE id = ?').run(photo.id);
  deleteUpload(photo.filename);
  res.json({ message: 'Photo deleted' });
});

export default router;
