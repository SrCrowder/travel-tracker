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
const locationFields = {
  name: z.string().trim().min(1).max(200),
  country: z.string().trim().max(100),
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
}).refine(datesInOrder, dateOrderIssue);

export const locationUpdateSchema = z.object(locationFields).partial().refine(datesInOrder, dateOrderIssue);

export const reorderSchema = z.object({
  order: z.array(z.object({ id, order_index: z.coerce.number().int().min(0) })).max(1000),
});

// ─── Trips ────────────────────────────────────────────────────────────────────
const coverPosition = z.coerce.number().min(0).max(100);

const tripFields = {
  title: z.string().trim().min(1).max(200),
  description: longText,
  start_date: isoDate,
  end_date: isoDate,
  tags: tagsSchema,
  cover_position_x: coverPosition,
  cover_position_y: coverPosition,
  // Locations saved in the same transaction as the trip
  new_locations: jsonField(z.array(locationCreateSchema).max(500)),
};

export const tripCreateSchema = z.object({
  ...tripFields,
  description: longText.default(''),
  tags: tripFields.tags.default([]),
  cover_position_x: coverPosition.default(50),
  cover_position_y: coverPosition.default(50),
  new_locations: tripFields.new_locations.default([]),
}).refine((d) => d.end_date >= d.start_date, { message: 'end_date must not be before start_date', path: ['end_date'] });

export const tripUpdateSchema = z.object({
  ...tripFields,
  new_locations: tripFields.new_locations.default([]),
  removed_location_ids: jsonField(z.array(id).max(500)).default([]),
  remove_cover: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
}).partial({ title: true, description: true, start_date: true, end_date: true, tags: true,
  cover_position_x: true, cover_position_y: true });

// ─── Photos ───────────────────────────────────────────────────────────────────
export const photoUploadSchema = z.object({
  location_id: z.preprocess(emptyToNull, id.nullable()).optional(),
  caption: z.string().max(2000).default(''),
});

export const photoUpdateSchema = z.object({
  caption: z.string().max(2000).default(''),
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
