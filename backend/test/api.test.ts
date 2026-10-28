import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { useTestEnv, PNG, listUploads } from './env';

const env = useTestEnv();
const { default: app } = await import('../src/app');
const { initDatabase } = await import('../src/database');
const { mediaQueueIdle } = await import('../src/services/mediaJobs');
initDatabase();

const api = request(app);

async function createTrip(fields: Record<string, string> = {}) {
  const req = api.post('/api/trips');
  const all = { title: 'Trip', start_date: '2024-05-01', end_date: '2024-05-10', ...fields };
  for (const [k, v] of Object.entries(all)) req.field(k, v);
  const res = await req;
  expect(res.status).toBe(201);
  return res.body;
}

describe('trips', () => {
  it('creates a trip with its locations in one request', async () => {
    const trip = await createTrip({
      tags: '["food","food","city"]',
      new_locations: JSON.stringify([
        { name: 'Rome', country: 'Italy', lat: 41.9, lng: 12.5 },
        { name: 'Florence', lat: '43.77', lng: '11.25', rating: 4, date_start: '2024-05-04', date_end: '' },
      ]),
    });
    expect(trip.tags).toEqual(['food', 'city']);
    expect(trip.locations.map((l: { name: string; order_index: number }) => [l.name, l.order_index]))
      .toEqual([['Rome', 0], ['Florence', 1]]);
    expect(trip.locations[1]).toMatchObject({ rating: 4, date_start: '2024-05-04', date_end: null });
  });

  it('rejects invalid data with 400 and saves nothing', async () => {
    const before = (await api.get('/api/trips')).body.length;
    const cases: Record<string, string>[] = [
      { title: '' },
      { start_date: '2024-02-30' },
      { end_date: '2024-04-01' }, // before start
      { tags: '{bad' },
      { tags: JSON.stringify(Array(21).fill('x')) },
      { new_locations: JSON.stringify([{ name: 'Nowhere', lat: 91, lng: 0 }]) },
      { new_locations: JSON.stringify([{ name: 'Rated', lat: 1, lng: 1, rating: 9 }]) },
    ];
    for (const fields of cases) {
      const req = api.post('/api/trips');
      for (const [k, v] of Object.entries({ title: 'T', start_date: '2024-05-01', end_date: '2024-05-10', ...fields })) {
        req.field(k, v);
      }
      const res = await req;
      expect(res.status, JSON.stringify(fields)).toBe(400);
    }
    expect((await api.get('/api/trips')).body.length).toBe(before);
  });

  it('updates a trip, adding and removing locations atomically', async () => {
    const trip = await createTrip({
      new_locations: JSON.stringify([
        { name: 'A', lat: 1, lng: 1 }, { name: 'B', lat: 2, lng: 2 }, { name: 'C', lat: 3, lng: 3 },
      ]),
    });
    const other = await createTrip({ new_locations: JSON.stringify([{ name: 'Other', lat: 0, lng: 0 }]) });
    const [a, b] = trip.locations;

    const res = await api.put(`/api/trips/${trip.id}`)
      .field('title', 'Renamed')
      // Other's location id must be ignored: it belongs to another trip
      .field('removed_location_ids', JSON.stringify([b.id, other.locations[0].id]))
      .field('new_locations', JSON.stringify([{ name: 'D', lat: 4, lng: 4 }]));
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Renamed');
    expect(res.body.locations.map((l: { name: string; order_index: number }) => [l.name, l.order_index]))
      .toEqual([['A', 0], ['C', 1], ['D', 2]]);
    expect(res.body.locations[0].id).toBe(a.id);
    expect((await api.get(`/api/trips/${other.id}`)).body.locations).toHaveLength(1);
  });

  it('rejects an update that puts the end date before the start', async () => {
    const trip = await createTrip();
    const res = await api.put(`/api/trips/${trip.id}`).field('end_date', '2024-04-01');
    expect(res.status).toBe(400);
  });

  it('lists trips even if a stored tags value is corrupt', async () => {
    const trip = await createTrip();
    const { default: db } = await import('../src/database/db');
    db.prepare('UPDATE trips SET tags = ? WHERE id = ?').run('{not json', trip.id);
    const res = await api.get('/api/trips');
    expect(res.status).toBe(200);
    expect(res.body.find((t: { id: number }) => t.id === trip.id).tags).toEqual([]);
  });
});

describe('locations', () => {
  it('only edits or deletes a location through its own trip', async () => {
    const t1 = await createTrip({ new_locations: JSON.stringify([{ name: 'Mine', lat: 1, lng: 1 }]) });
    const t2 = await createTrip();
    const locId = t1.locations[0].id;

    expect((await api.put(`/api/trips/${t2.id}/locations/${locId}`).send({ name: 'Hacked' })).status).toBe(404);
    expect((await api.delete(`/api/trips/${t2.id}/locations/${locId}`)).status).toBe(404);

    const ok = await api.put(`/api/trips/${t1.id}/locations/${locId}`).send({ rating: 5, notes: 'nice' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ name: 'Mine', rating: 5, notes: 'nice' });
  });

  it('validates coordinates, ratings and dates', async () => {
    const trip = await createTrip();
    const post = (body: object) => api.post(`/api/trips/${trip.id}/locations`).send(body);
    expect((await post({ name: 'X', lat: 'abc', lng: 1 })).status).toBe(400);
    expect((await post({ name: 'X', lat: 1, lng: 200 })).status).toBe(400);
    expect((await post({ name: 'X', lat: 1, lng: 1, rating: 6 })).status).toBe(400);
    expect((await post({ name: 'X', lat: 1, lng: 1, date_start: '2024-05-05', date_end: '2024-05-01' })).status).toBe(400);
    const ok = await post({ name: 'X', lat: 1, lng: 1, rating: 0 });
    expect(ok.status).toBe(201);
    expect(ok.body.rating).toBeNull();
  });

  it('reorders locations', async () => {
    const trip = await createTrip({
      new_locations: JSON.stringify([{ name: 'A', lat: 1, lng: 1 }, { name: 'B', lat: 2, lng: 2 }]),
    });
    const [a, b] = trip.locations;
    const res = await api.post(`/api/trips/${trip.id}/locations/reorder`)
      .send({ order: [{ id: a.id, order_index: 1 }, { id: b.id, order_index: 0 }] });
    expect(res.status).toBe(200);
    const names = (await api.get(`/api/trips/${trip.id}/locations`)).body.map((l: { name: string }) => l.name);
    expect(names).toEqual(['B', 'A']);
  });
});

describe('photos', () => {
  it('stores real images with an extension chosen by the server', async () => {
    const trip = await createTrip();
    const res = await api.post(`/api/trips/${trip.id}/photos`)
      .attach('photos', PNG, { filename: 'evil.html', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.photos[0].filename).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(res.body.photos[0].original_name).toBe('evil.html');

    const file = await api.get(`/uploads/${res.body.photos[0].filename}`);
    expect(file.headers['content-type']).toBe('image/png');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(file.headers['content-security-policy']).toContain('sandbox');
  });

  it('rejects files that are not images and leaves nothing on disk', async () => {
    const trip = await createTrip();
    // Earlier uploads may still be writing their thumbnails
    await mediaQueueIdle();
    const before = listUploads(env.uploadsDir).length;
    const html = Buffer.from('<html><script>alert(1)</script></html>');

    expect((await api.post(`/api/trips/${trip.id}/photos`)
      .attach('photos', html, { filename: 'x.png', contentType: 'image/png' })).status).toBe(400);
    expect((await api.post(`/api/trips/${trip.id}/photos`)
      .attach('photos', html, { filename: 'x.html', contentType: 'text/html' })).status).toBe(400);
    expect((await api.post('/api/trips/99999/photos')
      .attach('photos', PNG, { filename: 'a.png', contentType: 'image/png' })).status).toBe(404);
    expect(listUploads(env.uploadsDir).length).toBe(before);
  });

  it('deletes photo files together with the trip', async () => {
    const trip = await createTrip();
    const up = await api.post(`/api/trips/${trip.id}/photos`)
      .attach('photos', PNG, { filename: 'a.png', contentType: 'image/png' });
    const filename = up.body.photos[0].filename;
    expect(listUploads(env.uploadsDir)).toContain(filename);
    expect((await api.delete(`/api/trips/${trip.id}`)).status).toBe(200);
    expect(listUploads(env.uploadsDir)).not.toContain(filename);
  });
});
