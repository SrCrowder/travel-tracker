import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { useTestEnv } from './env';

useTestEnv({ password: 'secret' });
const { default: app } = await import('../src/app');
const { initDatabase } = await import('../src/database');
initDatabase();

const login = (password: string, ip = '10.0.0.1') =>
  request(app).post('/api/auth/login').set('X-Forwarded-For', ip).send({ username: 'admin', password });

describe('auth', () => {
  it('reports that login is required', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.body).toEqual({ authRequired: true, authenticated: false });
  });

  it('blocks the API and the uploads without a session', async () => {
    expect((await request(app).get('/api/trips')).status).toBe(401);
    expect((await request(app).get('/uploads/x.png')).status).toBe(401);
    expect((await request(app).get('/health')).status).toBe(200);
  });

  it('keeps share links and the backup behind the right doors', async () => {
    // Share links work without logging in (unknown token → 404, not 401)…
    expect((await request(app).get('/api/public/trips/nope')).status).toBe(404);
    // …but creating them, and backups, need a session
    expect((await request(app).post('/api/trips/1/share')).status).toBe(401);
    expect((await request(app).get('/api/backup')).status).toBe(401);
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
  });
});
