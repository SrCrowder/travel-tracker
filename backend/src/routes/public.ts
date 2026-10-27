import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import db from '../database/db';
import { getTrip } from '../database/queries';
import { uploadHeaders } from '../middleware/upload';
import { UPLOADS_DIR } from '../config';
import type { TripRow } from '../types';

// Read-only access to one trip through its share link: no login needed, but
// only that trip and its own files, and nothing private (notes, budget).
const router = Router();

const tripByToken = (token: string) =>
  db.prepare('SELECT * FROM trips WHERE share_token = ?').get(token) as TripRow | undefined;

router.get('/trips/:token', (req: Request, res: Response) => {
  const row = tripByToken(req.params.token);
  if (!row) return res.status(404).json({ error: 'This link is not valid anymore' });

  const trip = getTrip(row.id)!;
  res.json({
    ...trip,
    share_token: undefined,
    budget: undefined,
    locations: trip.locations.map((l) => ({ ...l, notes: '' })),
  });
});

router.get('/:token/media/:filename', (req: Request, res: Response) => {
  const row = tripByToken(req.params.token);
  const { filename } = req.params;
  if (!row || filename !== path.basename(filename)) return res.status(404).end();

  const belongs = row.cover_image === filename || !!db.prepare(`
    SELECT 1 FROM photos WHERE trip_id = ? AND (filename = ? OR thumb_filename = ?)
  `).get(row.id, filename, filename);
  const file = path.join(UPLOADS_DIR, filename);
  if (!belongs || !fs.existsSync(file)) return res.status(404).end();

  uploadHeaders(res, file);
  res.sendFile(file, { headers: { 'Cache-Control': 'private, max-age=86400' } });
});

export default router;
