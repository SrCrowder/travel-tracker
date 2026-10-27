import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import request from 'supertest';
import { useTestEnv, PNG, listUploads } from './env';

const env = useTestEnv();
process.env.MEDIA_RETRY_DELAY_MS = '10'; // retries without waiting a minute
const { default: app } = await import('../src/app');
const { initDatabase } = await import('../src/database');
const { mediaQueueIdle, resumePendingMedia, MAX_ATTEMPTS } = await import('../src/services/mediaJobs');
const { detectMedia } = await import('../src/services/media');
const { backfillMetadata } = await import('../src/services/backfill');
const { default: db } = await import('../src/database/db');
initDatabase();

const api = request(app);
const fixture = (name: string) => fs.readFileSync(path.join(__dirname, 'fixtures', name));
const exists = (name: string | null | undefined) => !!name && fs.existsSync(path.join(env.uploadsDir, name));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Waits for the queue, including retries scheduled with a delay. */
async function settle() {
  for (let i = 0; i < 100; i++) {
    await mediaQueueIdle();
    await sleep(30);
    const pending = db.prepare(
      `SELECT COUNT(*) AS n FROM photos WHERE (status = 'processing' OR thumb_filename IS NULL) AND status != 'failed' AND attempts < ${MAX_ATTEMPTS}`
    ).get() as { n: number };
    if (pending.n === 0) return;
  }
}

async function createTrip() {
  const res = await api.post('/api/trips').field('title', 'Sicily').field('start_date', '2019-10-19').field('end_date', '2019-10-22');
  return res.body as { id: number };
}

async function getPhoto(tripId: number, id: number) {
  const photos = (await api.get(`/api/trips/${tripId}/photos`)).body as Array<Record<string, unknown>>;
  return photos.find((p) => p.id === id)!;
}

const ffprobe = (file: string, entries: string) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
  '-show_entries', `stream=${entries}`, '-of', 'csv=p=0', path.join(env.uploadsDir, file)]).toString().trim();

describe('format detection', () => {
  it('recognises formats from their bytes', () => {
    expect(detectMedia(fixture('iphone7.heic').subarray(0, 64))).toEqual({ format: 'heic', kind: 'image' });
    expect(detectMedia(fixture('iphone-ios18.heic').subarray(0, 64))).toEqual({ format: 'heic', kind: 'image' });
    expect(detectMedia(fixture('iphone-hevc.mov').subarray(0, 64))).toEqual({ format: 'mov', kind: 'video' });
    expect(detectMedia(fixture('h264.mp4').subarray(0, 64))).toEqual({ format: 'mp4', kind: 'video' });
    expect(detectMedia(PNG)).toEqual({ format: 'png', kind: 'image' });
    expect(detectMedia(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
  });
});

describe('photos', () => {
  it('imports an iPhone HEIC: reads EXIF at once, makes the JPEG + thumbnail in the background', async () => {
    const trip = await createTrip();
    // iPhones/browsers often send HEIC without a proper MIME type
    const res = await api.post(`/api/trips/${trip.id}/photos`)
      .attach('photos', fixture('iphone7.heic'), { filename: 'IMG_0001.HEIC', contentType: 'application/octet-stream' });
    expect(res.status).toBe(201);
    expect(res.body.failed).toEqual([]);
    const photo = res.body.photos[0];
    expect(photo).toMatchObject({
      media_type: 'image', status: 'processing', original_name: 'IMG_0001.HEIC', geo_source: 'exif',
      taken_at: '2019-10-20T18:34:30', taken_offset: '+02:00', camera: 'Apple iPhone 7',
    });
    expect(photo.lat).toBeCloseTo(38.0466, 3);
    expect(photo.lng).toBeCloseTo(12.9944, 3);
    expect(photo.filename).toMatch(/\.jpg$/);
    expect(photo.original_filename).toMatch(/\.heic$/);

    await settle();
    const ready = await getPhoto(trip.id, photo.id);
    expect(ready).toMatchObject({ status: 'ready', error: null });
    expect(ready.thumb_filename).toMatch(/\.thumb\.webp$/);
    expect(ready.width).toBeGreaterThan(0);

    // The original file is stored byte-for-byte
    expect(fs.readFileSync(path.join(env.uploadsDir, photo.original_filename)).equals(fixture('iphone7.heic'))).toBe(true);
    expect((await api.get(`/uploads/${photo.filename}`)).headers['content-type']).toBe('image/jpeg');
    expect((await api.get(`/uploads/${ready.thumb_filename}`)).headers['content-type']).toBe('image/webp');
  });

  it('reads date and GPS from iOS 18 HEIC files (longer ftyp box)', async () => {
    const trip = await createTrip();
    const res = await api.post(`/api/trips/${trip.id}/photos`).attach('photos', fixture('iphone-ios18.heic'), 'IMG_1978.HEIC');
    expect(res.status).toBe(201);
    expect(res.body.photos[0]).toMatchObject({ taken_at: '2019-10-20T18:34:30', camera: 'Apple iPhone 7' });
    expect(res.body.photos[0].lat).toBeCloseTo(38.0466, 3);
    await settle();
    expect(exists((await getPhoto(trip.id, res.body.photos[0].id)).filename as string)).toBe(true); // still decodes
  });

  it('recovers date and GPS of photos uploaded while they could not be read', async () => {
    const trip = await createTrip();
    const photo = (await api.post(`/api/trips/${trip.id}/photos`).attach('photos', fixture('iphone-ios18.heic'), 'a.heic')).body.photos[0];
    // As stored by the old version: no metadata
    db.prepare('UPDATE photos SET taken_at = NULL, taken_offset = NULL, lat = NULL, lng = NULL WHERE id = ?').run(photo.id);
    expect(await backfillMetadata()).toBeGreaterThanOrEqual(1);
    const fixed = await getPhoto(trip.id, photo.id);
    expect(fixed.taken_at).toBe('2019-10-20T18:34:30');
    expect(fixed.lat).toBeCloseTo(38.0466, 3);
    await settle();
  });

  it('accepts a HEIC cover and stores a browser-friendly JPEG', async () => {
    const res = await api.post('/api/trips').field('title', 'Cover').field('start_date', '2024-01-01').field('end_date', '2024-01-02')
      .attach('cover_image', fixture('iphone7.heic'), { filename: 'cover.heic', contentType: 'image/heic' });
    expect(res.status).toBe(201);
    expect(res.body.cover_image).toMatch(/\.jpg$/);
    expect(exists(res.body.cover_image)).toBe(true);
  });

  it('refuses a video as cover', async () => {
    const res = await api.post('/api/trips').field('title', 'Cover').field('start_date', '2024-01-01').field('end_date', '2024-01-02')
      .attach('cover_image', fixture('h264.mp4'), { filename: 'cover.mp4', contentType: 'video/mp4' });
    expect(res.status).toBe(400);
  });

  it('makes thumbnails for photos uploaded before thumbnails existed', async () => {
    const trip = await createTrip();
    fs.writeFileSync(path.join(env.uploadsDir, 'legacy.png'), PNG);
    const { lastInsertRowid } = db.prepare(
      "INSERT INTO photos (trip_id, filename, original_name) VALUES (?, 'legacy.png', 'old.png')"
    ).run(trip.id);

    expect(resumePendingMedia()).toBeGreaterThanOrEqual(1);
    await settle();
    const photo = await getPhoto(trip.id, Number(lastInsertRowid));
    expect(photo.thumb_filename).toBe('legacy.thumb.webp');
    expect(exists(photo.thumb_filename as string)).toBe(true);
  });
});

describe('uploads with problems', () => {
  it('keeps the good files of a batch and says why the others were refused', async () => {
    const trip = await createTrip();
    const res = await api.post(`/api/trips/${trip.id}/photos`)
      .attach('photos', PNG, 'good.png')
      .attach('photos', Buffer.from('<html>nope</html>'), 'notes.html')
      .attach('photos', fixture('iphone7.heic'), 'good.heic');
    expect(res.status).toBe(201);
    expect(res.body.photos.map((p: { original_name: string }) => p.original_name)).toEqual(['good.png', 'good.heic']);
    expect(res.body.failed).toEqual([{ name: 'notes.html', reason: 'unsupported_format' }]);
    await settle();
  });

  it('answers 400 with the reasons when nothing could be accepted', async () => {
    const trip = await createTrip();
    const res = await api.post(`/api/trips/${trip.id}/photos`).attach('photos', Buffer.from('nope'), 'a.txt');
    expect(res.status).toBe(400);
    expect(res.body.failed).toEqual([{ name: 'a.txt', reason: 'unsupported_format' }]);
  });

  it('stores a file it cannot process yet, retries, then marks it failed (and can retry on demand)', async () => {
    const trip = await createTrip();
    // A real MOV header with garbage after it: accepted, but unconvertible
    const broken = Buffer.concat([fixture('iphone-hevc.mov').subarray(0, 64), Buffer.alloc(4000, 7)]);
    const res = await api.post(`/api/trips/${trip.id}/photos`).attach('photos', broken, 'broken.mov');
    expect(res.status).toBe(201);
    const video = res.body.photos[0];
    expect(video.status).toBe('processing');
    expect(exists(video.original_filename)).toBe(true); // the original is kept no matter what

    await settle();
    const failed = await getPhoto(trip.id, video.id);
    expect(failed).toMatchObject({ status: 'failed', attempts: MAX_ATTEMPTS });
    expect(failed.error).toBeTruthy();

    const retry = await api.post(`/api/trips/${trip.id}/photos/retry`).send({});
    expect(retry.body.queued).toBe(1);
    await settle();
    expect((await getPhoto(trip.id, video.id)).status).toBe('failed');
  });
});

describe('placing photos without GPS', () => {
  it('sets or clears the position of several items at once, inside the trip only', async () => {
    const trip = await createTrip();
    const other = await createTrip();
    const loc = (await api.post(`/api/trips/${trip.id}/locations`).send({ name: 'Erice', lat: 38.04, lng: 12.59 })).body;
    const [a, b] = (await api.post(`/api/trips/${trip.id}/photos`).attach('photos', PNG, 'a.png').attach('photos', PNG, 'b.png')).body.photos;
    const foreign = (await api.post(`/api/trips/${other.id}/photos`).attach('photos', PNG, 'c.png')).body.photos[0];

    const res = await api.patch(`/api/trips/${trip.id}/photos`)
      .send({ ids: [a.id, b.id, foreign.id], lat: 38.04, lng: 12.59, location_id: loc.id, geo_source: 'estimated' });
    expect(res.body.updated).toBe(2);
    expect(await getPhoto(trip.id, a.id)).toMatchObject({ lat: 38.04, lng: 12.59, location_id: loc.id, geo_source: 'estimated' });
    expect((await getPhoto(other.id, foreign.id)).lat).toBeNull();

    await api.patch(`/api/trips/${trip.id}/photos`).send({ ids: [a.id], lat: null, lng: null });
    expect(await getPhoto(trip.id, a.id)).toMatchObject({ lat: null, geo_source: null, location_id: loc.id });

    expect((await api.patch(`/api/trips/${trip.id}/photos`).send({ ids: [a.id], lat: 1, lng: null })).status).toBe(400);
    expect((await api.patch(`/api/trips/${trip.id}/photos`).send({ ids: [a.id], lat: 1, lng: 1, location_id: 99999 })).status).toBe(400);
    await settle();
  });
});

describe('videos', () => {
  it('converts an iPhone HEVC .mov to a playable MP4 in the background', async () => {
    const trip = await createTrip();
    const res = await api.post(`/api/trips/${trip.id}/photos`)
      .attach('photos', fixture('iphone-hevc.mov'), { filename: 'IMG_0002.MOV', contentType: 'video/quicktime' });
    expect(res.status).toBe(201);
    const video = res.body.photos[0];
    expect(video).toMatchObject({
      media_type: 'video', status: 'processing',
      taken_at: '2019-10-20T18:40:00', taken_offset: '+02:00', camera: 'Apple iPhone 15',
      width: 1280, height: 720,
    });
    expect(video.lat).toBeCloseTo(38.0466, 3);
    expect(video.duration).toBeCloseTo(3, 0);
    expect(video.original_filename).toMatch(/\.mov$/);
    expect(video.filename).toMatch(/\.mp4$/);

    await settle();
    const ready = await getPhoto(trip.id, video.id);
    expect(ready.status).toBe('ready');
    expect(exists(ready.thumb_filename as string)).toBe(true);
    expect(ffprobe(video.filename, 'codec_name')).toBe('h264');
    expect(exists(video.original_filename)).toBe(true); // original kept

    // Seeking in the browser needs range requests
    const partial = await api.get(`/uploads/${video.filename}`).set('Range', 'bytes=0-99');
    expect(partial.status).toBe(206);
    expect(partial.headers['content-type']).toBe('video/mp4');
  });

  it('tone-maps HDR (HLG 10-bit) videos to standard 8-bit H.264', async () => {
    const trip = await createTrip();
    const video = (await api.post(`/api/trips/${trip.id}/photos`).attach('photos', fixture('iphone-hdr.mov'), 'hdr.mov')).body.photos[0];
    await settle();
    const ready = await getPhoto(trip.id, video.id);
    expect(ready.status, String(ready.error)).toBe('ready');
    expect(ffprobe(video.filename, 'codec_name,pix_fmt')).toBe('h264,yuv420p');
    expect(ffprobe(video.filename, 'color_transfer')).not.toBe('arib-std-b67');
  });

  it('takes photos and videos together in one upload', async () => {
    const trip = await createTrip();
    const res = await api.post(`/api/trips/${trip.id}/photos`)
      .attach('photos', fixture('iphone7.heic'), 'a.heic')
      .attach('photos', fixture('h264.mp4'), 'b.mp4')
      .attach('photos', PNG, 'c.png');
    expect(res.status).toBe(201);
    expect(res.body.photos.map((p: { media_type: string }) => p.media_type)).toEqual(['image', 'video', 'image']);
    await settle();
    const mp4 = await getPhoto(trip.id, res.body.photos[1].id);
    expect(mp4.status).toBe('ready');
    expect(mp4.filename).toMatch(/\.web\.mp4$/); // remuxed copy next to the original .mp4
  });

  it('lists a location\'s media in the order they were taken', async () => {
    const trip = await createTrip();
    const loc = (await api.post(`/api/trips/${trip.id}/locations`).send({ name: 'Trapani', lat: 38.01, lng: 12.5 })).body;
    await api.post(`/api/trips/${trip.id}/photos`).field('location_id', loc.id).attach('photos', fixture('iphone-hevc.mov'), 'v.mov');
    await api.post(`/api/trips/${trip.id}/photos`).field('location_id', loc.id).attach('photos', fixture('iphone7.heic'), 'p.heic');
    const full = (await api.get(`/api/trips/${trip.id}`)).body;
    // photo 18:34:30 before video 18:40:00, although uploaded after it
    expect(full.locations[0].photos.map((p: { media_type: string }) => p.media_type)).toEqual(['image', 'video']);
    await settle();
  });

  it('deletes the original, the converted copy and the poster', async () => {
    const trip = await createTrip();
    const video = (await api.post(`/api/trips/${trip.id}/photos`).attach('photos', fixture('iphone-hevc.mov'), 'v.mov')).body.photos[0];
    await settle();
    const ready = await getPhoto(trip.id, video.id);
    expect((await api.delete(`/api/trips/${trip.id}/photos/${video.id}`)).status).toBe(200);
    for (const name of [ready.filename, ready.original_filename, ready.thumb_filename]) {
      expect(listUploads(env.uploadsDir)).not.toContain(name);
    }
  });
});
