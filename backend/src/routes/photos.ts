import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import db from '../database/db';
import upload, { UPLOADS_DIR } from '../middleware/upload';

const router = Router({ mergeParams: true });

// ─── GET photos for a trip (optionally filtered by location) ─────────────────
router.get('/', (req: Request, res: Response) => {
  try {
    const { location_id } = req.query;
    let photos;

    if (location_id) {
      photos = db.prepare(
        'SELECT * FROM photos WHERE trip_id = ? AND location_id = ? ORDER BY created_at'
      ).all(req.params.tripId, location_id);
    } else {
      photos = db.prepare(
        'SELECT * FROM photos WHERE trip_id = ? ORDER BY created_at'
      ).all(req.params.tripId);
    }

    res.json(photos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch photos' });
  }
});

// ─── POST upload photos ───────────────────────────────────────────────────────
router.post('/', upload.array('photos', 20), (req: Request, res: Response) => {
  try {
    const trip = db.prepare('SELECT id FROM trips WHERE id = ?').get(req.params.tripId);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const { location_id, caption } = req.body;
    const locationId = location_id ? Number(location_id) : null;

    // Validate location belongs to trip
    if (locationId) {
      const loc = db.prepare('SELECT id FROM locations WHERE id = ? AND trip_id = ?')
        .get(locationId, req.params.tripId);
      if (!loc) return res.status(400).json({ error: 'Location does not belong to this trip' });
    }

    const insertPhoto = db.prepare(`
      INSERT INTO photos (location_id, trip_id, filename, original_name, caption)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertAll = db.transaction(() =>
      files.map((file) =>
        insertPhoto.run(locationId, req.params.tripId, file.filename, file.originalname, caption || '')
      )
    );

    const results = insertAll();
    const insertedIds = results.map((r) => r.lastInsertRowid);
    const photos = insertedIds.map((id) =>
      db.prepare('SELECT * FROM photos WHERE id = ?').get(id)
    );

    res.status(201).json(photos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to upload photos' });
  }
});

// ─── PATCH update photo caption ───────────────────────────────────────────────
router.patch('/:photoId', (req: Request, res: Response) => {
  try {
    const { caption } = req.body;
    const photo = db.prepare('SELECT * FROM photos WHERE id = ? AND trip_id = ?')
      .get(req.params.photoId, req.params.tripId);

    if (!photo) return res.status(404).json({ error: 'Photo not found' });

    db.prepare('UPDATE photos SET caption = ? WHERE id = ?').run(caption ?? '', req.params.photoId);
    res.json(db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.photoId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update photo' });
  }
});

// ─── DELETE photo ─────────────────────────────────────────────────────────────
router.delete('/:photoId', (req: Request, res: Response) => {
  try {
    const photo = db.prepare('SELECT * FROM photos WHERE id = ? AND trip_id = ?')
      .get(req.params.photoId, req.params.tripId) as any;

    if (!photo) return res.status(404).json({ error: 'Photo not found' });

    // Remove file from disk
    const filePath = path.join(UPLOADS_DIR, photo.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    db.prepare('DELETE FROM photos WHERE id = ?').run(req.params.photoId);
    res.json({ message: 'Photo deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete photo' });
  }
});

export default router;
