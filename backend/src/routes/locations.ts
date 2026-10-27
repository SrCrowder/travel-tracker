import { Router, Request, Response } from 'express';
import db from '../database/db';
import { Location } from '../types';

const router = Router({ mergeParams: true });

// ─── GET all locations for a trip ────────────────────────────────────────────
router.get('/', (req: Request, res: Response) => {
  try {
    const locations = db.prepare(`
      SELECT l.*,
        COALESCE(
          (SELECT json_group_array(json_object(
            'id', p.id, 'location_id', p.location_id,
            'trip_id', p.trip_id, 'filename', p.filename,
            'original_name', p.original_name, 'caption', p.caption,
            'created_at', p.created_at
          )) FROM photos p WHERE p.location_id = l.id), '[]'
        ) AS photos_json
      FROM locations l
      WHERE l.trip_id = ?
      ORDER BY l.order_index
    `).all(req.params.tripId) as any[];

    res.json(locations.map((l) => ({
      ...l,
      photos: JSON.parse(l.photos_json || '[]'),
      photos_json: undefined,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

// ─── POST create location for a trip ─────────────────────────────────────────
router.post('/', (req: Request, res: Response) => {
  try {
    const trip = db.prepare('SELECT id FROM trips WHERE id = ?').get(req.params.tripId);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const { name, country, lat, lng, date_start, date_end, description, notes, rating } = req.body;

    if (!name || lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'name, lat, and lng are required' });
    }

    // Auto-assign next order_index
    const maxOrder = db.prepare(
      'SELECT COALESCE(MAX(order_index), -1) as max FROM locations WHERE trip_id = ?'
    ).get(req.params.tripId) as { max: number };

    const result = db.prepare(`
      INSERT INTO locations (trip_id, name, country, lat, lng, date_start, date_end, description, notes, order_index, rating)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.params.tripId,
      name,
      country || '',
      Number(lat),
      Number(lng),
      date_start || null,
      date_end || null,
      description || '',
      notes || '',
      maxOrder.max + 1,
      rating ? Number(rating) : null,
    );

    const newLocation = db.prepare('SELECT * FROM locations WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ ...(newLocation as object), photos: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create location' });
  }
});

// ─── PUT update location ──────────────────────────────────────────────────────
router.put('/:locationId', (req: Request, res: Response) => {
  try {
    const existing = db.prepare('SELECT * FROM locations WHERE id = ?').get(req.params.locationId) as Location | undefined;
    if (!existing) return res.status(404).json({ error: 'Location not found' });

    const { name, country, lat, lng, date_start, date_end, description, notes, order_index, rating } = req.body;

    db.prepare(`
      UPDATE locations
      SET name = ?, country = ?, lat = ?, lng = ?, date_start = ?, date_end = ?,
          description = ?, notes = ?, order_index = ?, rating = ?
      WHERE id = ?
    `).run(
      name ?? existing.name,
      country ?? existing.country,
      lat !== undefined ? Number(lat) : existing.lat,
      lng !== undefined ? Number(lng) : existing.lng,
      date_start !== undefined ? date_start : existing.date_start,
      date_end !== undefined ? date_end : existing.date_end,
      description ?? existing.description,
      notes ?? existing.notes,
      order_index !== undefined ? Number(order_index) : existing.order_index,
      rating !== undefined ? (rating ? Number(rating) : null) : existing.rating,
      req.params.locationId,
    );

    const updated = db.prepare('SELECT * FROM locations WHERE id = ?').get(req.params.locationId);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update location' });
  }
});

// ─── DELETE location ──────────────────────────────────────────────────────────
router.delete('/:locationId', (req: Request, res: Response) => {
  try {
    const existing = db.prepare('SELECT * FROM locations WHERE id = ?').get(req.params.locationId);
    if (!existing) return res.status(404).json({ error: 'Location not found' });

    db.prepare('DELETE FROM locations WHERE id = ?').run(req.params.locationId);
    res.json({ message: 'Location deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete location' });
  }
});

// ─── POST reorder locations ───────────────────────────────────────────────────
router.post('/reorder', (req: Request, res: Response) => {
  try {
    const { order } = req.body as { order: Array<{ id: number; order_index: number }> };
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order array is required' });

    const update = db.prepare('UPDATE locations SET order_index = ? WHERE id = ? AND trip_id = ?');
    const reorderAll = db.transaction(() => {
      order.forEach(({ id, order_index }) => {
        update.run(order_index, id, req.params.tripId);
      });
    });
    reorderAll();
    res.json({ message: 'Locations reordered' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reorder locations' });
  }
});

export default router;
