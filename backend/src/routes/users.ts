import { Router, Request, Response } from 'express';
import db from '../database/db';
import { ADMIN_USERNAME } from '../middleware/auth';
import { hashPassword } from '../services/passwords';
import { userCreateSchema, userUpdateSchema, validate } from '../validation';

// Users the admin creates: they can log in to open share links, nothing else
const router = Router();

const COLUMNS = 'id, username, created_at, last_login_at';
const getUser = (id: string | number) =>
  db.prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?`).get(id);

function nameTaken(username: string, exceptId?: number): boolean {
  if (username.toLowerCase() === ADMIN_USERNAME.toLowerCase()) return true;
  return !!db.prepare('SELECT 1 FROM users WHERE username = ? AND id IS NOT ?').get(username, exceptId ?? null);
}

router.get('/', (_req: Request, res: Response) => {
  res.json(db.prepare(`SELECT ${COLUMNS} FROM users ORDER BY username`).all());
});

router.post('/', async (req: Request, res: Response) => {
  const body = validate(userCreateSchema, req.body, res);
  if (!body) return;
  if (nameTaken(body.username)) return res.status(409).json({ error: 'That username is already in use' });

  const hash = await hashPassword(body.password);
  const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(body.username, hash);
  res.status(201).json(getUser(Number(result.lastInsertRowid)));
});

router.patch('/:id', async (req: Request, res: Response) => {
  if (!getUser(req.params.id)) return res.status(404).json({ error: 'User not found' });
  const body = validate(userUpdateSchema, req.body, res);
  if (!body) return;
  if (body.username && nameTaken(body.username, Number(req.params.id))) {
    return res.status(409).json({ error: 'That username is already in use' });
  }

  if (body.username) db.prepare('UPDATE users SET username = ? WHERE id = ?').run(body.username, req.params.id);
  if (body.password) {
    // A new password logs the user out everywhere
    const hash = await hashPassword(body.password);
    db.prepare('UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?')
      .run(hash, req.params.id);
  }
  res.json(getUser(req.params.id));
});

router.delete('/:id', (req: Request, res: Response) => {
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'User not found' });
  res.json({ ok: true });
});

export default router;
