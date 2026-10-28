import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { useTestEnv } from './env';

useTestEnv({ password: 'secret' });
const { default: app } = await import('../src/app');
const { initDatabase } = await import('../src/database');
initDatabase();

const login = (password: string, ip = '10.0.0.1') =>
  request(app).post('/api/auth/login').set('X-Forwarded-For', ip).send({ username: 'admin', password });

describe('users', () => {
  const admin = request.agent(app);
  const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  const userLogin = (username: string, password: string, ip = '10.5.0.1') => {
    const agent = request.agent(app);
    return agent.post('/api/auth/login').set('X-Forwarded-For', ip).send({ username, password }).then((res) => ({ agent, res }));
  };

  it('lets the admin create, list, rename and delete users', async () => {
    await admin.post('/api/auth/login').set('X-Forwarded-For', '10.5.9.9').send({ username: 'admin', password: 'secret' });
    const created = await admin.post('/api/users').send({ username: 'ana', password: 'contraseña1' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ username: 'ana' });
    expect(created.body.password_hash).toBeUndefined();

    expect((await admin.post('/api/users').send({ username: 'ANA', password: 'otra-clave1' })).status).toBe(409);
    expect((await admin.post('/api/users').send({ username: 'Admin', password: 'otra-clave1' })).status).toBe(409);
    expect((await admin.post('/api/users').send({ username: 'bob', password: 'short' })).status).toBe(400);
    expect((await admin.post('/api/users').send({ username: 'a b', password: 'long-enough' })).status).toBe(400);

    const list = await admin.get('/api/users');
    expect(list.body.map((u: { username: string }) => u.username)).toEqual(['ana']);

    const tmp = await admin.post('/api/users').send({ username: 'temp', password: 'temporal1' });
    expect((await admin.patch(`/api/users/${tmp.body.id}`).send({ username: 'temp2' })).body.username).toBe('temp2');
    expect((await admin.delete(`/api/users/${tmp.body.id}`)).status).toBe(200);
    expect((await admin.delete(`/api/users/${tmp.body.id}`)).status).toBe(404);
  });

  it('a user opens share links and nothing else', async () => {
    const trip = await admin.post('/api/trips').field('title', 'Compartido').field('status', 'wishlist');
    const photo = await admin.post(`/api/trips/${trip.body.id}/photos`)
      .attach('photos', Buffer.from(PNG_B64, 'base64'), { filename: 'a.png', contentType: 'image/png' });
    const token = (await admin.post(`/api/trips/${trip.body.id}/share`)).body.share_token;

    const { agent, res } = await userLogin('Ana', 'contraseña1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ authenticated: true, role: 'user', username: 'ana' });

    expect((await agent.get(`/api/public/trips/${token}`)).status).toBe(200);
    expect((await agent.get(`/api/public/${token}/media/${photo.body.photos[0].filename}`)).status).toBe(200);
    // The app, the files and the admin tools stay closed
    expect((await agent.get('/api/trips')).status).toBe(403);
    expect((await agent.get(`/uploads/${photo.body.photos[0].filename}`)).status).toBe(403);
    expect((await agent.get('/api/users')).status).toBe(403);
    expect((await agent.post('/api/users').send({ username: 'x', password: 'xxxxxxxx' })).status).toBe(403);
  });

  it('rejects a wrong password and ends sessions on password change or deletion', async () => {
    expect((await userLogin('ana', 'wrong-password', '10.5.0.2')).res.status).toBe(401);

    const { agent } = await userLogin('ana', 'contraseña1');
    const me = await agent.get('/api/auth/me');
    expect(me.body.role).toBe('user');

    const list = await admin.get('/api/users');
    const ana = list.body.find((u: { username: string }) => u.username === 'ana');
    expect(ana.last_login_at).toBeTruthy();
    await admin.patch(`/api/users/${ana.id}`).send({ password: 'nueva-clave1' });
    expect((await agent.get('/api/auth/me')).body.authenticated).toBe(false);
    expect((await userLogin('ana', 'contraseña1', '10.5.0.3')).res.status).toBe(401);

    const again = await userLogin('ana', 'nueva-clave1');
    expect(again.res.status).toBe(200);
    await admin.delete(`/api/users/${ana.id}`);
    expect((await again.agent.get('/api/auth/me')).body.authenticated).toBe(false);
  });
});

describe('auth', () => {
  it('reports that login is required', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.body).toEqual({ authRequired: true, authenticated: false, role: null, username: null });
  });

  it('blocks the API and the uploads without a session', async () => {
    expect((await request(app).get('/api/trips')).status).toBe(401);
    expect((await request(app).get('/uploads/x.png')).status).toBe(401);
    expect((await request(app).get('/health')).status).toBe(200);
  });

  it('keeps share links and the backup behind the right doors', async () => {
    // Share links need a login too (admin or a user)…
    expect((await request(app).get('/api/public/trips/nope')).status).toBe(401);
    expect((await request(app).get('/api/public/nope/media/x.jpg')).status).toBe(401);
    // …and creating them, backups and users need the admin
    expect((await request(app).post('/api/trips/1/share')).status).toBe(401);
    expect((await request(app).get('/api/backup')).status).toBe(401);
    expect((await request(app).get('/api/users')).status).toBe(401);
  });

  it('rejects wrong credentials', async () => {
    const res = await login('nope', '10.0.0.2');
    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('logs in, uses the session and logs out', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/login').send({ username: 'admin', password: 'secret' });
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie'][0]).toMatch(/tt_session=.*HttpOnly/);
    expect((await agent.get('/api/trips')).status).toBe(200);
    await agent.post('/api/auth/logout');
    expect((await agent.get('/api/trips')).status).toBe(401);
  });

  it('rejects a tampered session cookie', async () => {
    const res = await request(app).get('/api/trips').set('Cookie', `tt_session=${Date.now() + 1e9}.forged`);
    expect(res.status).toBe(401);
  });

  it('locks an IP out after 10 failures but not a known IP after the global cap', async () => {
    expect((await login('secret', '10.9.0.1')).status).toBe(200); // owner, now a known IP
    for (let i = 0; i < 10; i++) await login('bad', '10.9.0.2');
    expect((await login('secret', '10.9.0.2')).status).toBe(429);

    for (let i = 0; i < 100; i++) await login('bad', `10.8.${i >> 8}.${i & 255}`);
    expect((await login('secret', '10.7.0.1')).status).toBe(429); // unknown IP: global cap
    expect((await login('secret', '10.9.0.1')).status).toBe(200); // known IP still gets in
    // A user's login doesn't make its IP known: still under the global cap
    expect((await login('secret', '10.5.0.1')).status).toBe(429);
  });

  it('keeps sessions from before users existed (admin)', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'secret' });
    expect((await agent.get('/api/auth/me')).body).toMatchObject({ role: 'admin', username: 'admin' });
  });
});
