import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import db from '../database/db';
import upload, { UPLOADS_DIR } from '../middleware/upload';
import { Trip } from '../types';

const router = Router();

// ─── GET all trips (with location summaries) ────────────────────────────────
router.get('/', (_req: Request, res: Response) => {
  try {
    const rows = db.prepare(`
      SELECT
        t.*,
        COALESCE(
          (SELECT json_group_array(json_object(
            'id',          l.id,
            'trip_id',     l.trip_id,
            'name',        l.name,
            'country',     l.country,
            'lat',         l.lat,
            'lng',         l.lng,
            'date_start',  l.date_start,
            'date_end',    l.date_end,
            'description', l.description,
            'notes',       l.notes,
            'order_index', l.order_index,
            'rating',      l.rating
          ))
          FROM locations l WHERE l.trip_id = t.id
          ORDER BY l.order_index
        ), '[]'
        ) AS locations_json
      FROM trips t
      ORDER BY t.start_date DESC
    `).all() as any[];

    const result = rows.map((row) => ({
      ...row,
      tags: JSON.parse(row.tags || '[]'),
      locations: JSON.parse(row.locations_json || '[]'),
      locations_json: undefined,
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch trips' });
  }
});

// ─── GET single trip (with locations + photos) ───────────────────────────────
router.get('/:id', (req: Request, res: Response) => {
  try {
    const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id) as Trip | undefined;
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const locations = db.prepare(`
      SELECT
        l.*,
        COALESCE(
          (SELECT json_group_array(json_object(
            'id',            p.id,
            'location_id',   p.location_id,
            'trip_id',       p.trip_id,
            'filename',      p.filename,
            'original_name', p.original_name,
            'caption',       p.caption,
            'created_at',    p.created_at
          ))
          FROM photos p WHERE p.location_id = l.id
        ), '[]'
        ) AS photos_json
      FROM locations l
      WHERE l.trip_id = ?
      ORDER BY l.order_index
    `).all(req.params.id) as any[];

    const tripPhotos = db.prepare(
      'SELECT * FROM photos WHERE trip_id = ? AND location_id IS NULL ORDER BY created_at'
    ).all(req.params.id);

    res.json({
      ...trip,
      tags: JSON.parse((trip as any).tags || '[]'),
      locations: locations.map((l) => ({
        ...l,
        photos: JSON.parse(l.photos_json || '[]'),
        photos_json: undefined,
      })),
      photos: tripPhotos,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch trip' });
  }
});

// ─── POST create trip ────────────────────────────────────────────────────────
router.post('/', upload.single('cover_image'), (req: Request, res: Response) => {
  try {
    const { title, description, start_date, end_date, tags, cover_position_x, cover_position_y } = req.body;

    if (!title || !start_date || !end_date) {
      return res.status(400).json({ error: 'title, start_date, and end_date are required' });
    }

    const cover_image = req.file?.filename ?? null;
    const tagsJson = typeof tags === 'string' ? tags : JSON.stringify(tags || []);
    const posX = cover_position_x !== undefined ? parseFloat(cover_position_x) : 50;
    const posY = cover_position_y !== undefined ? parseFloat(cover_position_y) : 50;

    const result = db.prepare(`
      INSERT INTO trips (title, description, start_date, end_date, cover_image, tags, cover_position_x, cover_position_y)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(title, description || '', start_date, end_date, cover_image, tagsJson, posX, posY);

    const newTrip = db.prepare('SELECT * FROM trips WHERE id = ?').get(result.lastInsertRowid) as any;
    res.status(201).json({ ...newTrip, tags: JSON.parse(newTrip.tags || '[]'), locations: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create trip' });
  }
});

// ─── PUT update trip ─────────────────────────────────────────────────────────
router.put('/:id', upload.single('cover_image'), (req: Request, res: Response) => {
  try {
    const existing = db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: 'Trip not found' });

    const { title, description, start_date, end_date, tags, remove_cover, cover_position_x, cover_position_y } = req.body;

    let cover_image = existing.cover_image;
    if (req.file) {
      // Delete old cover image if exists
      if (existing.cover_image) {
        const oldPath = path.join(UPLOADS_DIR, existing.cover_image);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      cover_image = req.file.filename;
    } else if (remove_cover === 'true' && existing.cover_image) {
      const oldPath = path.join(UPLOADS_DIR, existing.cover_image);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      cover_image = null;
    }

    const tagsJson = tags !== undefined
      ? (typeof tags === 'string' ? tags : JSON.stringify(tags))
      : existing.tags;

    const posX = cover_position_x !== undefined ? parseFloat(cover_position_x) : (existing.cover_position_x ?? 50);
    const posY = cover_position_y !== undefined ? parseFloat(cover_position_y) : (existing.cover_position_y ?? 50);

    db.prepare(`
      UPDATE trips
      SET title = ?, description = ?, start_date = ?, end_date = ?, cover_image = ?, tags = ?, cover_position_x = ?, cover_position_y = ?
      WHERE id = ?
    `).run(
      title ?? existing.title,
      description ?? existing.description,
      start_date ?? existing.start_date,
      end_date ?? existing.end_date,
      cover_image,
      tagsJson,
      posX,
      posY,
      req.params.id,
    );

    const updated = db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id) as any;
    res.json({ ...updated, tags: JSON.parse(updated.tags || '[]') });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update trip' });
  }
});

// ─── DELETE trip ─────────────────────────────────────────────────────────────
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id) as any;
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    // Remove all associated photo files from disk
    const photos = db.prepare('SELECT filename FROM photos WHERE trip_id = ?').all(req.params.id) as any[];
    photos.forEach((p) => {
      const filePath = path.join(UPLOADS_DIR, p.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    });

    // Remove cover image file
    if (trip.cover_image) {
      const coverPath = path.join(UPLOADS_DIR, trip.cover_image);
      if (fs.existsSync(coverPath)) fs.unlinkSync(coverPath);
    }

    db.prepare('DELETE FROM trips WHERE id = ?').run(req.params.id);
    res.json({ message: 'Trip deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete trip' });
  }
});

export default router;
