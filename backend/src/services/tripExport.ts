import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import type { Response } from 'express';
import db from '../database/db';
import { getTrip } from '../database/queries';
import { UPLOADS_DIR } from '../config';
import type { ExpenseRow, PhotoRow } from '../types';

// ─── "Raw" export of one trip ─────────────────────────────────────────────────
// A ZIP with the files exactly as they were uploaded (HEIC, MOV… with all
// their metadata), named as on the user's device and grouped per place, plus
// everything else the app knows about the trip:
//
//   <Trip title>/
//     trip.json                 trip, places (with notes), media list, expenses, tracks
//     expenses.csv
//     cover.<ext>
//     media/00 General/IMG_0001.HEIC
//     media/01 Rome/IMG_0002.MOV
//     tracks/Morning walk.geojson

/** A name that is safe as a file/folder name on every OS. */
export function safeName(name: string, fallback = 'file'): string {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '');
  return (cleaned || fallback).slice(0, 100);
}

const pad = (n: number) => String(n).padStart(2, '0');

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  // Quote, and neutralise values a spreadsheet would run as a formula
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function streamTripExport(tripId: number, res: Response): Promise<boolean> {
  const trip = getTrip(tripId);
  if (!trip) return false;

  const root = safeName(trip.title, `trip-${trip.id}`);
  const archive = archiver('zip', { store: true }); // photos/videos are already compressed
  archive.on('error', (err) => res.destroy(err));
  res.attachment(`${root}.zip`);
  archive.pipe(res);

  // Folder per place, in route order; trip-level media go to "00 General"
  const folders = new Map<number | null, string>([[null, '00 General']]);
  trip.locations.forEach((l, i) => folders.set(l.id, `${pad(i + 1)} ${safeName(l.name, 'Place')}`));

  const used = new Set<string>();
  const unique = (wanted: string) => {
    const { dir, name, ext } = path.posix.parse(wanted);
    let candidate = wanted;
    for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${dir}/${name} (${n})${ext}`;
    used.add(candidate.toLowerCase());
    return candidate;
  };

  const media = [...trip.photos, ...trip.locations.flatMap((l) => l.photos)];
  const mediaIndex: Array<Record<string, unknown>> = [];
  for (const photo of media as PhotoRow[]) {
    const stored = photo.original_filename ?? photo.filename;
    const file = path.join(UPLOADS_DIR, stored);
    if (stored !== path.basename(stored) || !fs.existsSync(file)) continue;

    // The device's name, with the real extension of what's stored
    const ext = path.extname(stored);
    const base = safeName(path.parse(photo.original_name || stored).name, `photo-${photo.id}`);
    const entry = unique(`media/${folders.get(photo.location_id) ?? folders.get(null)}/${base}${ext}`);
    archive.file(file, { name: `${root}/${entry}` });
    mediaIndex.push({
      file: entry,
      type: photo.media_type,
      original_name: photo.original_name,
      caption: photo.caption,
      taken_at: photo.taken_at,
      taken_offset: photo.taken_offset,
      lat: photo.lat,
      lng: photo.lng,
      camera: photo.camera,
      width: photo.width,
      height: photo.height,
      duration: photo.duration,
      uploaded_at: photo.created_at,
    });
  }

  if (trip.cover_image && trip.cover_image === path.basename(trip.cover_image)) {
    const cover = path.join(UPLOADS_DIR, trip.cover_image);
    if (fs.existsSync(cover)) archive.file(cover, { name: `${root}/cover${path.extname(cover)}` });
  }

  const tracks = trip.tracks.map((t) => ({ ...t, file: unique(`tracks/${safeName(t.name, `track-${t.id}`)}.geojson`) }));
  for (const t of tracks) archive.append(JSON.stringify(t.geojson, null, 2), { name: `${root}/${t.file}` });

  const expenses = db.prepare('SELECT * FROM expenses WHERE trip_id = ? ORDER BY date IS NULL, date, id')
    .all(trip.id) as ExpenseRow[];
  const placeName = new Map(trip.locations.map((l) => [l.id, l.name]));
  const header = ['date', 'category', 'description', 'amount', 'currency', 'place'];
  const rows = expenses.map((e) => [e.date, e.category, e.description, e.amount, e.currency,
    e.location_id ? placeName.get(e.location_id) : '']);
  archive.append([header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n'), { name: `${root}/expenses.csv` });

  const { share_token: _token, photos: _photos, tracks: _tracks, ...tripInfo } = trip;
  archive.append(JSON.stringify({
    exported_at: new Date().toISOString(),
    trip: {
      ...tripInfo,
      locations: trip.locations.map(({ photos: _p, ...l }) => ({ ...l, folder: `media/${folders.get(l.id)}` })),
    },
    media: mediaIndex,
    expenses,
    tracks: tracks.map(({ geojson: _g, ...t }) => t),
  }, null, 2), { name: `${root}/trip.json` });

  await archive.finalize();
  return true;
}
