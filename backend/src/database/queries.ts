import db from './db';
import type { TripRow, LocationRow, PhotoRow, Trip, LocationWithPhotos, TripWithRelations } from '../types';

// ─── Shared SQL fragments ─────────────────────────────────────────────────────
const PHOTO_COLUMNS = ['id', 'location_id', 'trip_id', 'filename', 'original_name', 'caption', 'created_at'];
const LOCATION_COLUMNS = ['id', 'trip_id', 'name', 'country', 'lat', 'lng', 'date_start', 'date_end',
  'description', 'notes', 'order_index', 'rating'];

const jsonObject = (alias: string, columns: string[]) =>
  `json_object(${columns.map((c) => `'${c}', ${alias}.${c}`).join(', ')})`;

// JSON array of a location's photos (alias "l" must be the location)
const LOCATION_PHOTOS_JSON = `
  COALESCE((
    SELECT json_group_array(${jsonObject('p', PHOTO_COLUMNS)})
    FROM (SELECT * FROM photos WHERE location_id = l.id ORDER BY created_at, id) p
  ), '[]')`;

// JSON array of a trip's locations, without photos (alias "t" must be the trip)
const TRIP_LOCATIONS_JSON = `
  COALESCE((
    SELECT json_group_array(${jsonObject('l', LOCATION_COLUMNS)})
    FROM (SELECT * FROM locations WHERE trip_id = t.id ORDER BY order_index, id) l
  ), '[]')`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function parseTags(stored: string | null | undefined): string[] {
  try {
    const value = JSON.parse(stored || '[]');
    return Array.isArray(value) ? value.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return []; // never let one bad row break the whole listing
  }
}

export function toTrip(row: TripRow): Trip {
  return { ...row, tags: parseTags(row.tags) };
}

// ─── Queries ──────────────────────────────────────────────────────────────────
export function getTripRow(id: number | string): TripRow | undefined {
  return db.prepare('SELECT * FROM trips WHERE id = ?').get(id) as TripRow | undefined;
}

export function listTrips(): Array<Trip & { locations: LocationRow[] }> {
  const rows = db.prepare(`
    SELECT t.*, ${TRIP_LOCATIONS_JSON} AS locations_json
    FROM trips t
    ORDER BY t.start_date DESC
  `).all() as Array<TripRow & { locations_json: string }>;

  return rows.map(({ locations_json, ...row }) => ({
    ...toTrip(row),
    locations: JSON.parse(locations_json) as LocationRow[],
  }));
}

export function listLocations(tripId: number | string): LocationWithPhotos[] {
  const rows = db.prepare(`
    SELECT l.*, ${LOCATION_PHOTOS_JSON} AS photos_json
    FROM locations l
    WHERE l.trip_id = ?
    ORDER BY l.order_index, l.id
  `).all(tripId) as Array<LocationRow & { photos_json: string }>;

  return rows.map(({ photos_json, ...row }) => ({ ...row, photos: JSON.parse(photos_json) as PhotoRow[] }));
}

export function getTrip(id: number | string): TripWithRelations | undefined {
  const row = getTripRow(id);
  if (!row) return undefined;
  const photos = db.prepare(
    'SELECT * FROM photos WHERE trip_id = ? AND location_id IS NULL ORDER BY created_at, id'
  ).all(id) as PhotoRow[];
  return { ...toTrip(row), locations: listLocations(id), photos };
}

export function getLocation(tripId: number | string, locationId: number | string): LocationRow | undefined {
  return db.prepare('SELECT * FROM locations WHERE id = ? AND trip_id = ?')
    .get(locationId, tripId) as LocationRow | undefined;
}

export function getPhoto(tripId: number | string, photoId: number | string): PhotoRow | undefined {
  return db.prepare('SELECT * FROM photos WHERE id = ? AND trip_id = ?')
    .get(photoId, tripId) as PhotoRow | undefined;
}
