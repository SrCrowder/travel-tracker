// Helpers for the bulk import of photos and videos: read their metadata in
// the browser (so the user sees the timeline/map before uploading anything),
// group them into places and name those places.

import { readVideoMetadata } from './videoMetadata';
import { loadExifr } from './exifr';

export interface PhotoInfo {
  file: File;
  kind: 'image' | 'video';
  /** Local wall-clock time from the camera, "YYYY-MM-DDTHH:MM:SS" */
  takenAt: string | null;
  lat: number | null;
  lng: number | null;
}

export interface PhotoCluster {
  photos: PhotoInfo[];
  lat: number;
  lng: number;
  /** "YYYY-MM-DD" of the first and last photo with a date */
  dateStart: string | null;
  dateEnd: string | null;
  name: string;
  country: string;
  countryCode: string;
}

export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.heic', '.heif', '.tif', '.tiff'];
export const VIDEO_EXTENSIONS = ['.mov', '.mp4', '.m4v', '.webm'];
export const MAX_IMAGE_SIZE = 50 * 1024 * 1024;
export const MAX_VIDEO_SIZE = 4 * 1024 * 1024 * 1024;

/** react-dropzone `accept` for photos + videos (HEIC/MOV often come without a MIME type). */
export const MEDIA_ACCEPT = {
  'image/*': IMAGE_EXTENSIONS,
  'video/*': VIDEO_EXTENSIONS,
  'application/octet-stream': ['.heic', '.heif', '.mov'],
};

export function isVideoFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type.startsWith('video/') || VIDEO_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/** Videos may be large; photos have a lower limit (same as the server). */
export function mediaSizeValidator(file: File) {
  const max = isVideoFile(file) ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
  return file.size > max ? { code: 'file-too-large', message: 'File is too large' } : null;
}

function exifDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = value.match(/^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m || m[1] === '0000') return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
}

/** Reads date and GPS from each file. Files without metadata are kept, just without data. */
export async function readPhotoInfo(files: File[], onProgress?: (done: number) => void): Promise<PhotoInfo[]> {
  const exifr = await loadExifr();
  const results: PhotoInfo[] = [];
  for (const file of files) {
    if (isVideoFile(file)) {
      results.push({ file, kind: 'video', ...(await readVideoMetadata(file)) });
      onProgress?.(results.length);
      continue;
    }
    let info: PhotoInfo = { file, kind: 'image', takenAt: null, lat: null, lng: null };
    try {
      const tags = await exifr.parse(file, {
        tiff: true, exif: true, gps: true, xmp: false, icc: false, iptc: false, reviveValues: false,
      });
      if (tags) {
        const lat = Number.isFinite(tags.latitude) ? tags.latitude : null;
        const lng = Number.isFinite(tags.longitude) ? tags.longitude : null;
        const hasGps = lat !== null && lng !== null && !(lat === 0 && lng === 0);
        info = {
          file,
          kind: 'image',
          takenAt: exifDate(tags.DateTimeOriginal) ?? exifDate(tags.CreateDate),
          lat: hasGps ? lat : null,
          lng: hasGps ? lng : null,
        };
      }
    } catch {
      // No readable metadata — still importable
    }
    results.push(info);
    onProgress?.(results.length);
  }
  return results.sort(compareByDate);
}

function compareByDate(a: PhotoInfo, b: PhotoInfo) {
  if (a.takenAt && b.takenAt) return a.takenAt.localeCompare(b.takenAt);
  if (a.takenAt) return -1;
  if (b.takenAt) return 1;
  return a.file.name.localeCompare(b.file.name);
}

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * Groups geotagged photos into places: a photo joins the first place whose
 * centre is within `radiusKm`, otherwise it starts a new place. Photos without
 * GPS join the place of the closest-in-time geotagged photo taken the same
 * day; the rest are returned as `unplaced`. Places are ordered by first photo.
 */
export function clusterPhotos(photos: PhotoInfo[], radiusKm = 15): { clusters: PhotoCluster[]; unplaced: PhotoInfo[] } {
  const clusters: PhotoCluster[] = [];
  const geotagged = photos.filter((p) => p.lat !== null && p.lng !== null);

  for (const photo of geotagged) {
    const lat = photo.lat!, lng = photo.lng!;
    const target = clusters.find((c) => distanceKm(c.lat, c.lng, lat, lng) <= radiusKm);
    if (target) {
      target.photos.push(photo);
      const n = target.photos.length;
      target.lat += (lat - target.lat) / n;
      target.lng += (lng - target.lng) / n;
    } else {
      clusters.push({ photos: [photo], lat, lng, dateStart: null, dateEnd: null, name: '', country: '', countryCode: '' });
    }
  }

  const unplaced: PhotoInfo[] = [];
  for (const photo of photos) {
    if (photo.lat !== null) continue;
    const day = photo.takenAt?.slice(0, 10);
    let best: { cluster: PhotoCluster; gap: number } | null = null;
    if (photo.takenAt && day) {
      const t = Date.parse(photo.takenAt);
      for (const cluster of clusters) {
        for (const other of cluster.photos) {
          if (other.lat === null || !other.takenAt || other.takenAt.slice(0, 10) !== day) continue;
          const gap = Math.abs(Date.parse(other.takenAt) - t);
          if (!best || gap < best.gap) best = { cluster, gap };
        }
      }
    }
    if (best) best.cluster.photos.push(photo);
    else unplaced.push(photo);
  }

  for (const cluster of clusters) {
    // Pin the place on the photo nearest to the centre: the average of several
    // points can fall in the sea or a field, which geocodes badly
    let best = cluster.photos[0];
    for (const photo of cluster.photos) {
      if (photo.lat === null || photo.lng === null) continue;
      if (best.lat === null || distanceKm(photo.lat, photo.lng!, cluster.lat, cluster.lng)
        < distanceKm(best.lat, best.lng!, cluster.lat, cluster.lng)) best = photo;
    }
    cluster.lat = best.lat!;
    cluster.lng = best.lng!;
    cluster.photos.sort(compareByDate);
    const dates = cluster.photos.map((p) => p.takenAt?.slice(0, 10)).filter((d): d is string => !!d).sort();
    cluster.dateStart = dates[0] ?? null;
    cluster.dateEnd = dates[dates.length - 1] ?? null;
  }
  clusters.sort((a, b) => (a.photos[0].takenAt ?? '9999').localeCompare(b.photos[0].takenAt ?? '9999'));
  return { clusters, unplaced };
}

/** First and last day covered by the photos, if any has a date. */
export function dateRange(photos: PhotoInfo[]): { start: string; end: string } | null {
  const days = photos.map((p) => p.takenAt?.slice(0, 10)).filter((d): d is string => !!d).sort();
  return days.length ? { start: days[0], end: days[days.length - 1] } : null;
}

// ─── Reverse geocoding (OpenStreetMap Nominatim, max 1 request/second) ───────
let lastRequest = 0;

export async function reverseGeocode(lat: number, lng: number, language: string) {
  const wait = lastRequest + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10&addressdetails=1`,
    { headers: { 'Accept-Language': language } },
  );
  if (!res.ok) throw new Error('Reverse geocoding failed');
  const data = await res.json();
  const a = data.address ?? {};
  return {
    name: a.city || a.town || a.village || a.municipality || a.county || a.state || data.name || '',
    country: a.country || '',
    countryCode: (a.country_code || '').toUpperCase(),
  };
}
