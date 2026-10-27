import { Router, Request, Response } from 'express';
import db from '../database/db';
import { getLocation, getTripRow, listLocations } from '../database/queries';
import { locationCreateSchema, locationUpdateSchema, reorderSchema, validate } from '../validation';

const router = Router({ mergeParams: true });

// ─── GET all locations for a trip ────────────────────────────────────────────
router.get('/', (req: Request, res: Response) => {
  res.json(listLocations(req.params.tripId));
});

// ─── POST create location for a trip ─────────────────────────────────────────
router.post('/', (req: Request, res: Response) => {
  if (!getTripRow(req.params.tripId)) return res.status(404).json({ error: 'Trip not found' });

  const body = validate(locationCreateSchema, req.body, res);
  if (!body) return;

  // Appended at the end unless an explicit position is given
  const { next } = db.prepare(
    'SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM locations WHERE trip_id = ?'
  ).get(req.params.tripId) as { next: number };

  const result = db.prepare(`
    INSERT INTO locations (trip_id, name, country, country_code, lat, lng, date_start, date_end, description, notes, order_index, rating)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.params.tripId, body.name, body.country, body.country_code ?? null, body.lat, body.lng,
    body.date_start ?? null, body.date_end ?? null, body.description, body.notes,
    body.order_index ?? next, body.rating ?? null,
  );

  res.status(201).json({ ...getLocation(req.params.tripId, Number(result.lastInsertRowid)), photos: [] });
});

// ─── PUT update location ──────────────────────────────────────────────────────
router.put('/:locationId', (req: Request, res: Response) => {
  const existing = getLocation(req.params.tripId, req.params.locationId);
  if (!existing) return res.status(404).json({ error: 'Location not found' });

  const body = validate(locationUpdateSchema, req.body, res);
  if (!body) return;

  const merged = { ...existing, ...Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)) };
  if (merged.date_start && merged.date_end && merged.date_end < merged.date_start) {
    return res.status(400).json({ error: 'Invalid data', details: ['date_end: must not be before date_start'] });
  }

  db.prepare(`
    UPDATE locations
    SET name = @name, country = @country, country_code = @country_code, lat = @lat, lng = @lng, date_start = @date_start, date_end = @date_end,
        description = @description, notes = @notes, order_index = @order_index, rating = @rating
    WHERE id = @id AND trip_id = @trip_id
  `).run(merged);

  res.json(getLocation(req.params.tripId, req.params.locationId));
});

// ─── DELETE location ──────────────────────────────────────────────────────────
router.delete('/:locationId', (req: Request, res: Response) => {
  const result = db.prepare('DELETE FROM locations WHERE id = ? AND trip_id = ?')
    .run(req.params.locationId, req.params.tripId);
  if (result.changes === 0) return res.status(404).json({ error: 'Location not found' });
  res.json({ message: 'Location deleted' });
});

// ─── POST reorder locations ───────────────────────────────────────────────────
router.post('/reorder', (req: Request, res: Response) => {
  const body = validate(reorderSchema, req.body, res);
  if (!body) return;

  const update = db.prepare('UPDATE locations SET order_index = ? WHERE id = ? AND trip_id = ?');
  db.transaction(() => {
    body.order.forEach(({ id, order_index }) => update.run(order_index, id, req.params.tripId));
  })();
  res.json({ message: 'Locations reordered' });
});

export default router;
