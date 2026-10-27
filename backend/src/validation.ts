import { z } from 'zod';
import type { Response } from 'express';

// ─── Building blocks ──────────────────────────────────────────────────────────
// Multipart forms send everything as strings, so numbers are coerced and
// JSON-encoded fields (tags, new_locations…) are parsed before validation.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected a date YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, 'not a valid date');

const emptyToNull = (v: unknown) => (v === '' ? null : v);
const optionalDate = z.preprocess(emptyToNull, isoDate.nullable()).optional();

const jsonField = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => {
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch { return v; }
  }, schema);

const id = z.coerce.number().int().positive();
const longText = z.string().max(10_000);

export const tagsSchema = jsonField(
  z.array(z.string().trim().min(1).max(40)).max(20).transform((tags) => [...new Set(tags)]),
);

// ─── Locations ────────────────────────────────────────────────────────────────
const countryCode = z.preprocess(emptyToNull,
  z.string().regex(/^[A-Za-z]{2}$/, 'expected a 2-letter country code').transform((c) => c.toUpperCase()).nullable());
const currency = z.string().regex(/^[A-Za-z]{3}$/, 'expected a 3-letter currency code').transform((c) => c.toUpperCase());

const locationFields = {
  name: z.string().trim().min(1).max(200),
  country: z.string().trim().max(100),
  country_code: countryCode,
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  date_start: optionalDate,
  date_end: optionalDate,
  description: longText,
  notes: longText,
  // 0 / '' / null all mean "no rating"
  rating: z.preprocess((v) => (v === '' || v === 0 || v === '0' ? null : v),
    z.coerce.number().int().min(1).max(5).nullable()),
  order_index: z.coerce.number().int().min(0),
};

const datesInOrder = (d: { date_start?: string | null; date_end?: string | null }) =>
  !d.date_start || !d.date_end || d.date_end >= d.date_start;
const dateOrderIssue = { message: 'date_end must not be before date_start', path: ['date_end'] };

export const locationCreateSchema = z.object({
  ...locationFields,
  country: locationFields.country.default(''),
  description: longText.default(''),
  notes: longText.default(''),
  rating: locationFields.rating.optional(),
  order_index: locationFields.order_index.optional(),
  country_code: countryCode.optional(),
}).refine(datesInOrder, dateOrderIssue);

export const locationUpdateSchema = z.object(locationFields).partial().refine(datesInOrder, dateOrderIssue);

export const reorderSchema = z.object({
  order: z.array(z.object({ id, order_index: z.coerce.number().int().min(0) })).max(1000),
});

// ─── Trips ────────────────────────────────────────────────────────────────────
const coverPosition = z.coerce.number().min(0).max(100);

export const TRIP_STATUSES = ['done', 'planned', 'wishlist'] as const;

const tripFields = {
  title: z.string().trim().min(1).max(200),
  description: longText,
  // Wishlist trips may have no dates yet
  start_date: z.preprocess(emptyToNull, isoDate.nullable()),
  end_date: z.preprocess(emptyToNull, isoDate.nullable()),
  status: z.enum(TRIP_STATUSES),
  budget: z.preprocess(emptyToNull, z.coerce.number().min(0).max(1e9).nullable()),
  currency,
  tags: tagsSchema,
  cover_position_x: coverPosition,
  cover_position_y: coverPosition,
  // Locations saved in the same transaction as the trip
  new_locations: jsonField(z.array(locationCreateSchema).max(500)),
};

/** Dates are required unless the trip is a wishlist one, and must be in order. */
export function tripDatesProblem(d: { status: string; start_date: string | null; end_date: string | null }): string | null {
  if (d.status !== 'wishlist' && (!d.start_date || !d.end_date)) return 'start_date and end_date are required';
  if (!!d.start_date !== !!d.end_date) return 'give both start_date and end_date, or neither';
  if (d.start_date && d.end_date && d.end_date < d.start_date) return 'end_date must not be before start_date';
  return null;
}

export const tripCreateSchema = z.object({
  ...tripFields,
  description: longText.default(''),
  start_date: tripFields.start_date.default(null),
  end_date: tripFields.end_date.default(null),
  status: tripFields.status.default('done'),
  budget: tripFields.budget.default(null),
  currency: currency.default('EUR'),
  tags: tripFields.tags.default([]),
  cover_position_x: coverPosition.default(50),
  cover_position_y: coverPosition.default(50),
  new_locations: tripFields.new_locations.default([]),
}).superRefine((d, ctx) => {
  const problem = tripDatesProblem(d);
  if (problem) ctx.addIssue({ code: 'custom', message: problem, path: ['end_date'] });
});

export const tripUpdateSchema = z.object({
  ...tripFields,
  new_locations: tripFields.new_locations.default([]),
  removed_location_ids: jsonField(z.array(id).max(500)).default([]),
  remove_cover: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
}).partial({ title: true, description: true, start_date: true, end_date: true, tags: true,
  cover_position_x: true, cover_position_y: true, status: true, budget: true, currency: true });

// ─── Expenses ─────────────────────────────────────────────────────────────────
export const EXPENSE_CATEGORIES = ['transport', 'lodging', 'food', 'activities', 'shopping', 'other'] as const;

const expenseFields = {
  date: optionalDate,
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().trim().max(500),
  amount: z.coerce.number().min(0).max(1e9),
  currency,
  location_id: z.preprocess(emptyToNull, id.nullable()).optional(),
};

export const expenseCreateSchema = z.object({
  ...expenseFields,
  category: expenseFields.category.default('other'),
  description: expenseFields.description.default(''),
  currency: currency.optional(), // defaults to the trip's currency
});

export const expenseUpdateSchema = z.object(expenseFields).partial();

// ─── Photos ───────────────────────────────────────────────────────────────────
export const photoUploadSchema = z.object({
  location_id: z.preprocess(emptyToNull, id.nullable()).optional(),
  caption: z.string().max(2000).default(''),
});

export const photoUpdateSchema = z.object({
  caption: z.string().max(2000).default(''),
});

/** Place several photos/videos at once (or clear their position: lat/lng null). */
export const photoLocateSchema = z.object({
  ids: z.array(id).min(1).max(5000),
  lat: z.preprocess(emptyToNull, z.coerce.number().min(-90).max(90).nullable()),
  lng: z.preprocess(emptyToNull, z.coerce.number().min(-180).max(180).nullable()),
  // Also move them into a place of the trip (null = general photos); omit to keep
  location_id: z.preprocess(emptyToNull, id.nullable()).optional(),
  geo_source: z.enum(['manual', 'estimated']).default('manual'),
}).refine((d) => (d.lat === null) === (d.lng === null), { message: 'give both lat and lng, or neither', path: ['lng'] });

export const photoRetrySchema = z.object({
  ids: z.array(id).max(5000).optional(), // omit: every failed item of the trip
});

// ─── Helper ───────────────────────────────────────────────────────────────────
/** Parses `data`; on failure answers 400 with the problems and returns undefined. */
export function validate<T extends z.ZodType>(schema: T, data: unknown, res: Response): z.output<T> | undefined {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;
  res.status(400).json({
    error: 'Invalid data',
    details: result.error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)),
  });
  return undefined;
}
