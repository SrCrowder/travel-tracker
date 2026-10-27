import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import request from 'supertest';
import { useTestEnv, PNG, listUploads } from './env';

const env = useTestEnv();
const { default: app } = await import('../src/app');
const { initDatabase } = await import('../src/database');
const { videoQueueIdle } = await import('../src/services/videoQueue');
const { detectMedia } = await import('../src/services/media');
const { backfillPhotos } = await import('../src/services/backfill');
const { default: db } = await import('../src/database/db');
initDatabase();

const api = request(app);
const fixture = (name: string) => fs.readFileSync(path.join(__dirname, 'fixtures', name));
const exists = (name: string | null) => !!name && fs.existsSync(path.join(env.uploadsDir, name));

async function createTrip() {
  const res = await api.post('/api/trips').field('title', 'Sicily').field('start_date', '2019-10-19').field('end_date', '2019-10-22');
  return res.body as { id: number };
}

async function getPhoto(tripId: number, id: number) {
  const photos = (await api.get(`/api/trips/${tripId}/photos`)).body as Array<Record<string, unknown>>;
  return photos.find((p) => p.id === id)!;
}

describe('format detection', () => {
  it('recognises formats from their bytes', () => {
    expect(detectMedia(fixture('iphone7.heic').subarray(0, 64))).toEqual({ format: 'heic', kind: 'image' });
    expect(detectMedia(fixture('iphone-hevc.mov').subarray(0, 64))).toEqual({ format: 'mov', kind: 'video' });
    expect(detectMedia(fixture('h264.mp4').subarray(0, 64))).toEqual({ format: 'mp4', kind: 'video' });
    expect(detectMedia(PNG)).toEqual({ format: 'png', kind: 'image' });
    expect(detectMedia(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
  });
});

describe('photos', () => {
  it('imports an iPhone HEIC: keeps the original, adds a JPEG + thumbnail and reads EXIF', async () => {
    const trip = await createTrip();
    // iPhones/browsers often send HEIC without a proper MIME type
    const res = await api.post(`/api/trips/${trip.id}/photos`)
      .attach('photos', fixture('iphone7.heic'), { filename: 'IMG_0001.HEIC', contentType: 'application/octet-stream' });
    expect(res.status).toBe(201);
    const photo = res.body[0];
    expect(photo).toMatchObject({
      media_type: 'image', status: 'ready', original_name: 'IMG_0001.HEIC',
      taken_at: '2019-10-20T18:34:30', taken_offset: '+02:00', camera: 'Apple iPhone 7',
    });
    expect(photo.lat).toBeCloseTo(38.0466, 3);
    expect(photo.lng).toBeCloseTo(12.9944, 3);
    expect(photo.filename).toMatch(/\.jpg$/);
    expect(photo.original_filename).toMatch(/\.heic$/);
    expect(photo.thumb_filename).toMatch(/\.thumb\.webp$/);
    expect(photo.width).toBeGreaterThan(0);

    // The original file is stored byte-for-byte
    expect(fs.readFileSync(path.join(env.uploadsDir, photo.original_filename)).equals(fixture('iphone7.heic'))).toBe(true);
    expect((await api.get(`/uploads/${photo.filename}`)).headers['content-type']).toBe('image/jpeg');
    expect((await api.get(`/uploads/${photo.thumb_filename}`)).headers['content-type']).toBe('image/webp');
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

  it('generates thumbnails and EXIF for photos uploaded before this existed', async () => {
    const trip = await createTrip();
    fs.copyFileSync(path.join(__dirname, 'fixtures', 'iphone7.heic'), path.join(env.uploadsDir, 'legacy.heic'));
    // Legacy rows only had a browser-friendly file; use a PNG for that
    fs.writeFileSync(path.join(env.uploadsDir, 'legacy.png'), PNG);
    const { lastInsertRowid } = db.prepare(
      "INSERT INTO photos (trip_id, filename, original_name) VALUES (?, 'legacy.png', 'old.png')"
    ).run(trip.id);

    expect(await backfillPhotos()).toBeGreaterThanOrEqual(1);
    const photo = await getPhoto(trip.id, Number(lastInsertRowid));
    expect(photo.thumb_filename).toBe('legacy.thumb.webp');
    expect(exists(photo.thumb_filename as string)).toBe(true);
  });
});

describe('videos', () => {
  it('converts an iPhone HEVC .mov to a playable MP4 in the background', async () => {
    const trip = await createTrip();
    const res = await api.post(`/api/trips/${trip.id}/photos`)
      .attach('photos', fixture('iphone-hevc.mov'), { filename: 'IMG_0002.MOV', contentType: 'video/quicktime' });
    expect(res.status).toBe(201);
    const video = res.body[0];
    expect(video).toMatchObject({
      media_type: 'video', status: 'processing',
      taken_at: '2019-10-20T18:40:00', taken_offset: '+02:00', camera: 'Apple iPhone 15',
      width: 1280, height: 720,
    });
    expect(video.lat).toBeCloseTo(38.0466, 3);
    expect(video.duration).toBeCloseTo(3, 0);
    expect(video.original_filename).toMatch(/\.mov$/);
    expect(video.filename).toMatch(/\.mp4$/);
    expect(exists(video.thumb_filename)).toBe(true);

    await videoQueueIdle();
    const ready = await getPhoto(trip.id, video.id);
    expect(ready.status).toBe('ready');
    const codec = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name',
      '-of', 'csv=p=0', path.join(env.uploadsDir, video.filename)]).toString().trim();
    expect(codec).toBe('h264');
    expect(exists(video.original_filename)).toBe(true); // original kept

    // Seeking in the browser needs range requests
    const partial = await api.get(`/uploads/${video.filename}`).set('Range', 'bytes=0-99');
    expect(partial.status).toBe(206);
    expect(partial.headers['content-type']).toBe('video/mp4');
  });

  it('takes photos and videos together in one upload', async () => {
    const trip = await createTrip();
    const res = await api.post(`/api/trips/${trip.id}/photos`)
      .attach('photos', fixture('iphone7.heic'), 'a.heic')
      .attach('photos', fixture('h264.mp4'), 'b.mp4')
      .attach('photos', PNG, 'c.png');
    expect(res.status).toBe(201);
    expect(res.body.map((p: { media_type: string }) => p.media_type)).toEqual(['image', 'video', 'image']);
    await videoQueueIdle();
    const mp4 = await getPhoto(trip.id, res.body[1].id);
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
    await videoQueueIdle();
  });

  it('deletes the original, the converted copy and the poster', async () => {
    const trip = await createTrip();
    const video = (await api.post(`/api/trips/${trip.id}/photos`).attach('photos', fixture('iphone-hevc.mov'), 'v.mov')).body[0];
    await videoQueueIdle();
    expect((await api.delete(`/api/trips/${trip.id}/photos/${video.id}`)).status).toBe(200);
    for (const name of [video.filename, video.original_filename, video.thumb_filename]) {
      expect(listUploads(env.uploadsDir)).not.toContain(name);
    }
  });

  it('rejects a file that only pretends to be a video', async () => {
    const trip = await createTrip();
    await videoQueueIdle();
    const before = listUploads(env.uploadsDir).sort();
    const fake = Buffer.concat([fixture('iphone-hevc.mov').subarray(0, 64), Buffer.alloc(200)]);
    const res = await api.post(`/api/trips/${trip.id}/photos`)
      .attach('photos', PNG, 'fine.png') // processed first, must be cleaned up too
      .attach('photos', fake, 'broken.mov');
    expect(res.status).toBe(400);
    expect(listUploads(env.uploadsDir).sort()).toEqual(before);
  });
});
