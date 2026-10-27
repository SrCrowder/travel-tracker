import type { TripStatus } from '../../types';

export const AVAILABLE_TAGS = ['adventure', 'food', 'hiking', 'culture', 'beach', 'city', 'nature'];
export const TRIP_STATUSES: TripStatus[] = ['done', 'planned', 'wishlist'];
export const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'MXN', 'ARS', 'COP', 'CLP', 'BRL', 'CAD', 'AUD', 'MAD', 'THB', 'CNY', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'TRY', 'ISK'];

export interface TripFormValues {
  status: TripStatus;
  /** Text so the field can be empty */
  budget: string;
  currency: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  tags: string[];
  coverFile: File | null;
  coverPreview: string;
  coverPosX: number;
  coverPosY: number;
}

export const EMPTY_TRIP_FORM: TripFormValues = {
  status: 'done', budget: '', currency: 'EUR',
  title: '', description: '', startDate: '', endDate: '', tags: [],
  coverFile: null, coverPreview: '', coverPosX: 50, coverPosY: 50,
};

/** A location typed in the wizard, saved together with the trip. */
export interface LocationDraft {
  name: string;
  country: string;
  country_code?: string;
  lat: number;
  lng: number;
  date_start: string;
  date_end: string;
  description: string;
  notes: string;
  rating: number;
}

export const EMPTY_LOCATION_DRAFT: LocationDraft = {
  name: '', country: '', lat: 0, lng: 0, date_start: '', date_end: '', description: '', notes: '', rating: 0,
};

export const inputClass =
  'w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-400 transition-all';
export const smallInputClass =
  'w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-400';
export const labelClass = 'block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5';
export const smallLabelClass = 'block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1';
