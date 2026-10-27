import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import archiver from 'archiver';
import yauzl from 'yauzl';
import { useTestEnv, PNG } from './env';

const env = useTestEnv();
const { default: app } = await import('../src/app');
const { initDatabase } = await import('../src/database');
initDatabase();

const api = request(app);

async function createTrip(fields: Record<string, string> = {}) {
  const req = api.post('/api/trips');
  for (const [k, v] of Object.entries({ title: 'Trip', start_date: '2024-05-01', end_date: '2024-05-10', ...fields })) {
    req.field(k, v);
  }
  const res = await req;
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body;
}

const GPX = `<?xml version="1.0"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="41.9" lon="12.5"><name>Ignored waypoint</name></wpt>
  <trk><name>Morning walk</name><trkseg>
    <trkpt lat="41.9000" lon="12.5000"/><trkpt lat="41.9090" lon="12.5000"/><trkpt lat="41.9180" lon="12.5000"/>
  </trkseg></trk>
</gpx>`;

const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>Ferry</name>
  <LineString><coordinates>12.5,41.9,0 12.6,41.9,0</coordinates></LineString>
</Placemark></Document></kml>`;

describe('planned and wishlist trips', () => {
  it('lets wishlist trips have no dates, but not the others', async () => {
    const wish = await createTrip({ title: 'Japan someday', status: 'wishlist', start_date: '', end_date: '' });
    expect(wish).toMatchObject({ status: 'wishlist', start_date: null, end_date: null });

    expect((await api.post('/api/trips').field('title', 'X').field('status', 'done')).status).toBe(400);
    expect((await api.post('/api/trips').field('title', 'X').field('status', 'wishlist')
      .field('start_date', '2025-01-01')).status).toBe(400); // only one date
    expect((await api.post('/api/trips').field('title', 'X').field('status', 'bogus')
      .field('start_date', '2025-01-01').field('end_date', '2025-01-02')).status).toBe(400);
  });

  it('clears the dates when a trip becomes a wishlist, and requires them back', async () => {
    const trip = await createTrip({ status: 'planned' });
    const wish = await api.put(`/api/trips/${trip.id}`).field('status', 'wishlist').field('start_date', '').field('end_date', '');
    expect(wish.body).toMatchObject({ status: 'wishlist', start_date: null });
    expect((await api.put(`/api/trips/${trip.id}`).field('status', 'done')).status).toBe(400);
  });

  it('lists trips without dates last', async () => {
    const list = (await api.get('/api/trips')).body as Array<{ start_date: string | null }>;
    const firstNull = list.findIndex((t) => t.start_date === null);
    expect(list.slice(firstNull).every((t) => t.start_date === null)).toBe(true);
  });

  it('stores a budget and its currency', async () => {
    const trip = await createTrip({ budget: '1500.5', currency: 'usd' });
    expect(trip).toMatchObject({ budget: 1500.5, currency: 'USD' });
    expect((await api.put(`/api/trips/${trip.id}`).field('budget', '')).body.budget).toBeNull();
  });

  it('keeps the country code of locations', async () => {
    const trip = await createTrip({ new_locations: JSON.stringify([{ name: 'Rome', country: 'Italy', country_code: 'it', lat: 41.9, lng: 12.5 }]) });
    expect(trip.locations[0].country_code).toBe('IT');
    const bad = await api.post(`/api/trips/${trip.id}/locations`).send({ name: 'X', lat: 1, lng: 1, country_code: 'ITA' });
    expect(bad.status).toBe(400);
  });
});

describe('expenses', () => {
  it('adds, edits and deletes expenses in the trip currency by default', async () => {
    const trip = await createTrip({ currency: 'JPY', new_locations: JSON.stringify([{ name: 'Tokyo', lat: 35.6, lng: 139.7 }]) });
    const base = `/api/trips/${trip.id}/expenses`;
    const created = await api.post(base).send({ amount: '1200', category: 'food', description: 'Ramen', date: '2024-05-02', location_id: trip.locations[0].id });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ amount: 1200, currency: 'JPY', category: 'food', location_id: trip.locations[0].id });

    const updated = await api.put(`${base}/${created.body.id}`).send({ amount: 1500, currency: 'eur' });
    expect(updated.body).toMatchObject({ amount: 1500, currency: 'EUR', description: 'Ramen' });

    expect((await api.post(base).send({ amount: -5 })).status).toBe(400);
    expect((await api.post(base).send({ amount: 5, category: 'bribes' })).status).toBe(400);

    expect((await api.delete(`${base}/${created.body.id}`)).status).toBe(200);
    expect((await api.get(base)).body).toEqual([]);
  });

  it('keeps expenses inside their trip', async () => {
    const t1 = await createTrip();
    const t2 = await createTrip({ new_locations: JSON.stringify([{ name: 'Other', lat: 1, lng: 1 }]) });
    const exp = (await api.post(`/api/trips/${t1.id}/expenses`).send({ amount: 10 })).body;
    expect((await api.put(`/api/trips/${t2.id}/expenses/${exp.id}`).send({ amount: 1 })).status).toBe(404);
    expect((await api.delete(`/api/trips/${t2.id}/expenses/${exp.id}`)).status).toBe(404);
    expect((await api.post(`/api/trips/${t1.id}/expenses`).send({ amount: 1, location_id: t2.locations[0].id })).status).toBe(400);
  });
});

describe('tracks', () => {
  it('imports GPX and KML lines with their length', async () => {
    const trip = await createTrip();
    const gpx = await api.post(`/api/trips/${trip.id}/tracks`).attach('file', Buffer.from(GPX), 'walk.gpx');
    expect(gpx.status).toBe(201);
    expect(gpx.body.name).toBe('Morning walk');
    expect(gpx.body.distance_m).toBeGreaterThan(1900);
    expect(gpx.body.distance_m).toBeLessThan(2100);
    expect(gpx.body.geojson.features).toHaveLength(1); // the waypoint is not a line

    const kml = await api.post(`/api/trips/${trip.id}/tracks`).attach('file', Buffer.from(KML), 'ferry.kml');
    expect(kml.body).toMatchObject({ name: 'Ferry' });

    const full = (await api.get(`/api/trips/${trip.id}`)).body;
    expect(full.tracks.map((t: { name: string }) => t.name)).toEqual(['Morning walk', 'Ferry']);

    expect((await api.delete(`/api/trips/${trip.id}/tracks/${gpx.body.id}`)).status).toBe(200);
  });

  it('rejects files without lines', async () => {
    const trip = await createTrip();
    expect((await api.post(`/api/trips/${trip.id}/tracks`).attach('file', Buffer.from('<html></html>'), 'x.gpx')).status).toBe(400);
    const onlyPoints = '<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><wpt lat="1" lon="1"/></gpx>';
    expect((await api.post(`/api/trips/${trip.id}/tracks`).attach('file', Buffer.from(onlyPoints), 'x.gpx')).status).toBe(400);
  });
});

describe('share links', () => {
  it('shows a shared trip read-only, without private data, and stops when revoked', async () => {
    const trip = await createTrip({
      budget: '900',
      new_locations: JSON.stringify([{ name: 'Rome', lat: 41.9, lng: 12.5, notes: 'door code 1234' }]),
    });
    const other = await createTrip();
    const photo = (await api.post(`/api/trips/${trip.id}/photos`).attach('photos', PNG, 'a.png')).body[0];
    const otherPhoto = (await api.post(`/api/trips/${other.id}/photos`).attach('photos', PNG, 'b.png')).body[0];

    const { share_token: token } = (await api.post(`/api/trips/${trip.id}/share`)).body;
    expect(token).toMatch(/^[A-Za-z0-9_-]{24}$/);
    // Sharing again keeps the same link
    expect((await api.post(`/api/trips/${trip.id}/share`)).body.share_token).toBe(token);

    const shared = (await api.get(`/api/public/trips/${token}`)).body;
    expect(shared.title).toBe('Trip');
    expect(shared.locations[0].notes).toBe('');
    expect(shared.budget).toBeUndefined();
    expect(shared.share_token).toBeUndefined();

    expect((await api.get(`/api/public/${token}/media/${photo.filename}`)).status).toBe(200);
    expect((await api.get(`/api/public/${token}/media/${photo.thumb_filename}`)).status).toBe(200);
    expect((await api.get(`/api/public/${token}/media/${otherPhoto.filename}`)).status).toBe(404);
    expect((await api.get(`/api/public/${token}/media/..%2Fdata%2Ftravel.db`)).status).toBe(404);

    await api.delete(`/api/trips/${trip.id}/share`);
    expect((await api.get(`/api/public/trips/${token}`)).status).toBe(404);
    expect((await api.get(`/api/public/${token}/media/${photo.filename}`)).status).toBe(404);
  });
});

function zipEntries(buffer: Buffer): Promise<string[]> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, (err, zip) => {
      if (err || !zip) return reject(err);
      const names: string[] = [];
      zip.on('entry', (e: yauzl.Entry) => names.push(e.fileName));
      zip.on('end', () => resolve(names));
    });
  });
}

describe('backup', () => {
  it('exports everything and restores it, keeping the previous database aside', async () => {
    const trip = await createTrip({ title: 'Keep me' });
    const photo = (await api.post(`/api/trips/${trip.id}/photos`).attach('photos', PNG, 'p.png')).body[0];

    const exported = await api.get('/api/backup').buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(exported.status).toBe(200);
    expect(exported.headers['content-disposition']).toMatch(/travel-tracker-backup-.*\.zip/);
    const names = await zipEntries(exported.body);
    expect(names).toContain('travel.db');
    expect(names).toContain(`uploads/${photo.filename}`);

    // Lose the trip, then restore
    await api.delete(`/api/trips/${trip.id}`);
    expect((await api.get(`/api/trips/${trip.id}`)).status).toBe(404);

    const restored = await api.post('/api/backup/restore').attach('backup', exported.body, 'backup.zip');
    expect(restored.status, JSON.stringify(restored.body)).toBe(200);
    const back = (await api.get(`/api/trips/${trip.id}`)).body;
    expect(back.title).toBe('Keep me');
    expect(back.photos[0].filename).toBe(photo.filename);
    expect(fs.existsSync(path.join(env.uploadsDir, photo.filename))).toBe(true);
    expect(fs.existsSync(path.join(env.dataDir, restored.body.previous_database))).toBe(true);
  });

  it('ignores paths that try to escape the uploads folder and rejects non-backups', async () => {
    const zip = archiver('zip');
    const chunks: Buffer[] = [];
    zip.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise((r) => zip.on('end', r));
    zip.append(Buffer.from('owned'), { name: '../escape.txt' });
    zip.append(Buffer.from('owned'), { name: 'uploads/../../escape2.txt' });
    zip.append(Buffer.from('not a db'), { name: 'notes.txt' });
    await zip.finalize();
    await done;

    const res = await api.post('/api/backup/restore').attach('backup', Buffer.concat(chunks), 'evil.zip');
    expect(res.status).toBe(400); // no travel.db in it
    expect(fs.existsSync(path.join(env.root, 'escape.txt'))).toBe(false);
    expect(fs.existsSync(path.join(env.dataDir, '..', 'escape2.txt'))).toBe(false);

    expect((await api.post('/api/backup/restore').attach('backup', Buffer.from('nope'), 'x.zip')).status).toBe(400);
    expect(fs.readdirSync(env.dataDir).filter((f) => f.startsWith('restore-'))).toEqual([]);
  });
});
