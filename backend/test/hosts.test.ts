import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { useTestEnv } from './env';

useTestEnv();
process.env.ALLOWED_HOSTS = 'travel.example.com, 192.168.1.10:5173';
const { default: app } = await import('../src/app');
const { initDatabase } = await import('../src/database');
initDatabase();

describe('ALLOWED_HOSTS', () => {
  it('only answers on the configured host names (DNS rebinding)', async () => {
    expect((await request(app).get('/api/trips').set('Host', 'travel.example.com')).status).toBe(200);
    expect((await request(app).get('/api/trips').set('Host', '192.168.1.10:5173')).status).toBe(200);
    expect((await request(app).get('/api/trips').set('Host', 'attacker.example')).status).toBe(421);
    // The Docker healthcheck calls localhost
    expect((await request(app).get('/health').set('Host', 'localhost:3001')).status).toBe(200);
  });
});
