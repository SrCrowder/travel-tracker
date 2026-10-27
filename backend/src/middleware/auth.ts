import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DATA_DIR } from '../database/db';

// ─── Configuration ────────────────────────────────────────────────────────────
// Login is enabled only when WEB_PASSWORD is set (same variables as the other
// self-hosted apps). Without it the API stays open, which is fine on a LAN.
const WEB_USER = process.env.WEB_USER || 'admin';
const WEB_PASSWORD = process.env.WEB_PASSWORD || '';
export const AUTH_ENABLED = WEB_PASSWORD.length > 0;

const COOKIE_NAME = 'tt_session';
const SESSION_DAYS = Number(process.env.SESSION_DAYS) || 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

// Signing key persisted next to the database so sessions survive restarts.
// Changing WEB_PASSWORD invalidates every existing session.
function loadSecret(): Buffer {
  const file = path.join(DATA_DIR, 'session.secret');
  let secret: string;
  if (process.env.SESSION_SECRET) {
    secret = process.env.SESSION_SECRET;
  } else if (fs.existsSync(file)) {
    secret = fs.readFileSync(file, 'utf8').trim();
  } else {
    secret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(file, secret, { mode: 0o600 });
  }
  return crypto.createHash('sha256').update(`${secret}:${WEB_USER}:${WEB_PASSWORD}`).digest();
}

const SECRET = AUTH_ENABLED ? loadSecret() : Buffer.alloc(0);

// ─── Session tokens: "<expiry>.<hmac>" ───────────────────────────────────────
function sign(payload: string): string {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}

function createToken(): string {
  const expires = String(Date.now() + SESSION_MS);
  return `${expires}.${sign(expires)}`;
}

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function isValidToken(token: string | undefined): boolean {
  if (!token) return false;
  const [expires, mac] = token.split('.');
  if (!expires || !mac || !safeEqual(sign(expires), mac)) return false;
  return Number(expires) > Date.now();
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

function isAuthenticated(req: Request): boolean {
  return !AUTH_ENABLED || isValidToken(readCookie(req, COOKIE_NAME));
}

// ─── Middleware: protects the API and the uploaded images ────────────────────
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (isAuthenticated(req)) return next();
  res.status(401).json({ error: 'Authentication required' });
}

// ─── Brute-force protection ──────────────────────────────────────────────────
// Per-IP limit, plus a global one so rotating or spoofed IPs can't keep
// guessing. A lockout only blocks logins; existing sessions keep working.
const MAX_FAILURES_PER_IP = 10;
const MAX_FAILURES_GLOBAL = 100;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED_IPS = 10_000;
const GLOBAL_KEY = '*';
const failures = new Map<string, { count: number; first: number }>();

function failureCount(key: string): number {
  const entry = failures.get(key);
  if (!entry) return 0;
  if (Date.now() - entry.first > FAILURE_WINDOW_MS) {
    failures.delete(key);
    return 0;
  }
  return entry.count;
}

function isLockedOut(ip: string): boolean {
  return failureCount(ip) >= MAX_FAILURES_PER_IP || failureCount(GLOBAL_KEY) >= MAX_FAILURES_GLOBAL;
}

function recordFailure(ip: string) {
  if (failures.size >= MAX_TRACKED_IPS) {
    for (const key of failures.keys()) failureCount(key); // drops expired entries
    if (failures.size >= MAX_TRACKED_IPS) failures.clear();
  }
  for (const key of [ip, GLOBAL_KEY]) {
    const entry = failures.get(key);
    if (!entry || Date.now() - entry.first > FAILURE_WINDOW_MS) {
      failures.set(key, { count: 1, first: Date.now() });
    } else {
      entry.count++;
    }
  }
}

// ─── Routes: /api/auth ───────────────────────────────────────────────────────
export const authRouter = Router();

authRouter.get('/me', (req: Request, res: Response) => {
  res.json({ authRequired: AUTH_ENABLED, authenticated: isAuthenticated(req) });
});

authRouter.post('/login', (req: Request, res: Response) => {
  if (!AUTH_ENABLED) return res.json({ authRequired: false, authenticated: true });

  const ip = req.ip || 'unknown';
  if (isLockedOut(ip)) {
    return res.status(429).json({ error: 'Too many failed attempts, try again later' });
  }

  const { username, password } = req.body ?? {};
  const userOk = safeEqual(String(username ?? ''), WEB_USER);
  const passOk = safeEqual(String(password ?? ''), WEB_PASSWORD);
  if (!userOk || !passOk) {
    recordFailure(ip);
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  failures.delete(ip);
  res.cookie(COOKIE_NAME, createToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: SESSION_MS,
    path: '/',
  });
  res.json({ authRequired: true, authenticated: true });
});

authRouter.post('/logout', (req: Request, res: Response) => {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/' });
  res.json({ authRequired: AUTH_ENABLED, authenticated: !AUTH_ENABLED });
});
