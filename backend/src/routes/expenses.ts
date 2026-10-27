import { Router, Request, Response } from 'express';
import db from '../database/db';
import { getLocation, getTripRow } from '../database/queries';
import { expenseCreateSchema, expenseUpdateSchema, validate } from '../validation';
import type { ExpenseRow } from '../types';

const router = Router({ mergeParams: true });

const getExpense = (tripId: string, id: string | number) =>
  db.prepare('SELECT * FROM expenses WHERE id = ? AND trip_id = ?').get(id, tripId) as ExpenseRow | undefined;

router.get('/', (req: Request, res: Response) => {
  res.json(db.prepare('SELECT * FROM expenses WHERE trip_id = ? ORDER BY date IS NULL, date, id').all(req.params.tripId));
});

router.post('/', (req: Request, res: Response) => {
  const trip = getTripRow(req.params.tripId);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });

  const body = validate(expenseCreateSchema, req.body, res);
  if (!body) return;
  if (body.location_id && !getLocation(trip.id, body.location_id)) {
    return res.status(400).json({ error: 'Location does not belong to this trip' });
  }

  const result = db.prepare(`
    INSERT INTO expenses (trip_id, location_id, date, category, description, amount, currency)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(trip.id, body.location_id ?? null, body.date ?? null, body.category, body.description, body.amount,
    body.currency ?? trip.currency);
  res.status(201).json(getExpense(req.params.tripId, Number(result.lastInsertRowid)));
});

router.put('/:expenseId', (req: Request, res: Response) => {
  const existing = getExpense(req.params.tripId, req.params.expenseId);
  if (!existing) return res.status(404).json({ error: 'Expense not found' });

  const body = validate(expenseUpdateSchema, req.body, res);
  if (!body) return;
  if (body.location_id && !getLocation(req.params.tripId, body.location_id)) {
    return res.status(400).json({ error: 'Location does not belong to this trip' });
  }

  const merged = { ...existing, ...Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)) };
  db.prepare(`
    UPDATE expenses SET location_id = @location_id, date = @date, category = @category, description = @description,
      amount = @amount, currency = @currency
    WHERE id = @id AND trip_id = @trip_id
  `).run(merged);
  res.json(getExpense(req.params.tripId, existing.id));
});

router.delete('/:expenseId', (req: Request, res: Response) => {
  const result = db.prepare('DELETE FROM expenses WHERE id = ? AND trip_id = ?').run(req.params.expenseId, req.params.tripId);
  if (result.changes === 0) return res.status(404).json({ error: 'Expense not found' });
  res.json({ message: 'Expense deleted' });
});

export default router;
