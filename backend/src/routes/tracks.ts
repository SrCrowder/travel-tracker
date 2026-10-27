import { Router, Request, Response } from 'express';
import multer from 'multer';
import db from '../database/db';
import { getTripRow, listTracks } from '../database/queries';
import { parseTrackFile } from '../services/tracks';

const router = Router({ mergeParams: true });

// GPX/KML are small XML files: keep them in memory, never on disk
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1 } });

router.get('/', (req: Request, res: Response) => {
  res.json(listTracks(Number(req.params.tripId)));
});

router.post('/', upload.single('file'), (req: Request, res: Response) => {
  const trip = getTripRow(req.params.tripId);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  let parsed;
  try {
    const fallbackName = req.file.originalname.replace(/\.(gpx|kml)$/i, '');
    parsed = parseTrackFile(req.file.buffer.toString('utf8'), fallbackName);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message || 'Could not read the file' });
  }

  const result = db.prepare('INSERT INTO tracks (trip_id, name, geojson, distance_m) VALUES (?, ?, ?, ?)')
    .run(trip.id, parsed.name.slice(0, 200), JSON.stringify(parsed.geojson), parsed.distance_m);
  res.status(201).json(listTracks(trip.id).find((t) => t.id === Number(result.lastInsertRowid)));
});

router.delete('/:trackId', (req: Request, res: Response) => {
  const result = db.prepare('DELETE FROM tracks WHERE id = ? AND trip_id = ?').run(req.params.trackId, req.params.tripId);
  if (result.changes === 0) return res.status(404).json({ error: 'Track not found' });
  res.json({ message: 'Track deleted' });
});

export default router;
