import { differenceInCalendarDays, format, parseISO, type Locale } from 'date-fns';
import type { Trip } from '../types';

// Trip dates are calendar days ("YYYY-MM-DD"). parseISO reads them as local
// dates; new Date("YYYY-MM-DD") would read UTC and show the previous day in
// timezones behind UTC. Wishlist trips may have no dates at all.

type Dated = Pick<Trip, 'start_date' | 'end_date'>;

/** Number of days, both ends included; null without dates. */
export function tripDays(trip: Dated): number | null {
  if (!trip.start_date || !trip.end_date) return null;
  return differenceInCalendarDays(parseISO(trip.end_date), parseISO(trip.start_date)) + 1;
}

/** "May 1 – May 10, 2024"; null without dates. */
export function formatTripRange(trip: Dated, locale?: Locale): string | null {
  if (!trip.start_date || !trip.end_date) return null;
  return `${format(parseISO(trip.start_date), 'MMM d', { locale })} – ${format(parseISO(trip.end_date), 'MMM d, yyyy', { locale })}`;
}

export function tripYear(trip: Dated): number | null {
  return trip.start_date ? parseISO(trip.start_date).getFullYear() : null;
}
