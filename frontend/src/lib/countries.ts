import countries from 'i18n-iso-countries';
import en from 'i18n-iso-countries/langs/en.json';
import es from 'i18n-iso-countries/langs/es.json';
import type { Trip } from '../types';

countries.registerLocale(en);
countries.registerLocale(es);

/** ISO alpha-2 of a location: stored code, or guessed from its country name. */
export function countryCodeOf(location: { country_code?: string | null; country?: string }): string | null {
  if (location.country_code) return location.country_code.toUpperCase();
  const name = location.country?.trim();
  if (!name) return null;
  return countries.getAlpha2Code(name, 'en') ?? countries.getAlpha2Code(name, 'es') ?? null;
}

/** world-atlas identifies countries by their ISO numeric code ("380" = Italy). */
export const numericCode = (alpha2: string) => countries.alpha2ToNumeric(alpha2) ?? null;

export const countryName = (alpha2: string, lang: string) =>
  countries.getName(alpha2, lang === 'es' ? 'es' : 'en') ?? alpha2;

export interface CountryVisits {
  /** alpha-2 → trips that went there */
  visited: Map<string, Trip[]>;
  /** alpha-2 → planned/wishlist trips that go there (and weren't visited) */
  planned: Map<string, Trip[]>;
}

export function countryVisits(trips: Trip[]): CountryVisits {
  const visited = new Map<string, Trip[]>();
  const planned = new Map<string, Trip[]>();
  for (const trip of trips) {
    const target = trip.status === 'done' ? visited : planned;
    const codes = new Set((trip.locations ?? []).map(countryCodeOf).filter((c): c is string => !!c));
    for (const code of codes) target.set(code, [...(target.get(code) ?? []), trip]);
  }
  for (const code of visited.keys()) planned.delete(code);
  return { visited, planned };
}
