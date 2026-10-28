import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DATA_DIR } from '../config';
import db from '../database/db';
import { hashPassword, verifyPassword } from '../services/passwords';

// ─── Configuration ────────────────────────────────────────────────────────────
// Login is enabled only when WEB_PASSWORD is set (same variables as the other
// self-hosted apps). Without it the API stays open, which is fine on a LAN.
// WEB_USER is the admin: the whole app. Users the admin creates (users table)
// can only open share links.
const WEB_USER = process.env.WEB_USER || 'admin';
const WEB_PASSWORD = process.env.WEB_PASSWORD || '';
export const AUTH_ENABLED = WEB_PASSWORD.length > 0;

const COOKIE_NAME = 'tt_session';
const SESSION_DAYS = Number(process.env.SESSION_DAYS) || 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

// Signing key persisted next to the database so sessions survive restarts.
// Changing WEB_PASSWORD invalidates every existing session (users' too).
function loadSecret(): Buffer {
  fs.mkdirSync(DATA_DIR, { recursive: true });
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

// ─── Session tokens: "<payload>.<hmac>" ──────────────────────────────────────
// Payload: "a.<expiry>" for the admin, "u.<id>.<session_version>.<expiry>" for
// a user. Tokens from before users existed ("<expiry>.<hmac>") are the admin's.
export type Session = { role: 'admin'; username: string } | { role: 'user'; id: number; username: string };

function sign(payload: string): string {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}

function createToken(session: Session): string {
  const expires = String(Date.now() + SESSION_MS);
  const payload = session.role === 'admin'
    ? `a.${expires}`
    : `u.${session.id}.${sessionVersion(session.id)}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

interface UserRow { id: number; username: string; password_hash: string; session_version: number }

const findUser = (where: 'id' | 'username', value: string | number) =>
  db.prepare(`SELECT id, username, password_hash, session_version FROM users WHERE ${where} = ?`)
    .get(value) as UserRow | undefined;

const sessionVersion = (id: number) => findUser('id', id)?.session_version ?? 0;

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function parseToken(token: string | undefined): Session | null {
  if (!token) return null;
  const parts = token.split('.');
  const mac = parts.pop();
  const payload = parts.join('.');
  if (!payload || !mac || !safeEqual(sign(payload), mac)) return null;
  if (Number(parts[parts.length - 1]) <= Date.now()) return null;

  if (parts.length === 1 || (parts.length === 2 && parts[0] === 'a')) return { role: 'admin', username: WEB_USER };
  if (parts.length === 4 && parts[0] === 'u') {
    // Deleted users and changed passwords end their sessions
    const user = findUser('id', Number(parts[1]));
    if (user && String(user.session_version) === parts[2]) return { role: 'user', id: user.id, username: user.username };
  }
  return null;
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

export function getSession(req: Request): Session | null {
  if (!AUTH_ENABLED) return { role: 'admin', username: WEB_USER };
  return parseToken(readCookie(req, COOKIE_NAME));
}

// ─── Middleware ──────────────────────────────────────────────────────────────
/** The app itself, its API and the uploaded files: admin only. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = getSession(req);
  if (session?.role === 'admin') return next();
  if (session) return res.status(403).json({ error: 'Only the admin can do this' });
  res.status(401).json({ error: 'Authentication required' });
}

/** Share links: anyone logged in (admin or user). */
export function requireSession(req: Request, res: Response, next: NextFunction) {
  if (getSession(req)) return next();
  res.status(401).json({ error: 'Authentication required' });
}

// ─── Brute-force protection ──────────────────────────────────────────────────
// Per-IP limit, plus a global one so rotating or spoofed IPs can't keep
// guessing. IPs where the admin logged in before skip the global limit, so
// an attacker can't lock the owner out. Existing sessions always keep working.
const MAX_FAILURES_PER_IP = 10;
const MAX_FAILURES_GLOBAL = 100;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED_IPS = 10_000;
const GLOBAL_KEY = '*';
const failures = new Map<string, { count: number; first: number }>();
const knownIps = new Map<string, number>(); // ip -> last successful login
const MAX_KNOWN_IPS = 1000;

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
  if (failureCount(ip) >= MAX_FAILURES_PER_IP) return true;
  const lastLogin = knownIps.get(ip);
  if (lastLogin && Date.now() - lastLogin < SESSION_MS) return false;
  return failureCount(GLOBAL_KEY) >= MAX_FAILURES_GLOBAL;
}

// Only the admin's IPs skip the global cap: a user's account must not open a
// way around it for guessing the admin password
function recordSuccess(ip: string, trusted: boolean) {
  failures.delete(ip);
  if (!trusted) return;
  knownIps.delete(ip); // re-insert so the oldest entry is evicted first
  knownIps.set(ip, Date.now());
  if (knownIps.size > MAX_KNOWN_IPS) knownIps.delete(knownIps.keys().next().value!);
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

const status = (session: Session | null) => ({
  authRequired: AUTH_ENABLED,
  authenticated: !!session,
  role: session?.role ?? null,
  username: session?.username ?? null,
});

// Same work whether or not the user exists, so timing doesn't reveal names
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));

authRouter.get('/me', (req: Request, res: Response) => {
  res.json(status(getSession(req)));
});

authRouter.post('/login', async (req: Request, res: Response) => {
  if (!AUTH_ENABLED) return res.json(status(getSession(req)));

  const ip = req.ip || 'unknown';
  if (isLockedOut(ip)) {
    return res.status(429).json({ error: 'Too many failed attempts, try again later' });
  }

  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');
  let session: Session | null = null;
  if (safeEqual(username, WEB_USER) && safeEqual(password, WEB_PASSWORD)) {
    session = { role: 'admin', username: WEB_USER };
  } else {
    const user = username.length <= 64 ? findUser('username', username) : undefined;
    const ok = await verifyPassword(password, user?.password_hash ?? await DUMMY_HASH);
    if (user && ok) {
      session = { role: 'user', id: user.id, username: user.username };
      db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
    }
  }
  if (!session) {
    recordFailure(ip);
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  recordSuccess(ip, session.role === 'admin');
  res.cookie(COOKIE_NAME, createToken(session), {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: SESSION_MS,
    path: '/',
  });
  res.json(status(session));
});

authRouter.post('/logout', (req: Request, res: Response) => {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/' });
  res.json(status(AUTH_ENABLED ? null : getSession(req)));
});

export const ADMIN_USERNAME = WEB_USER;
