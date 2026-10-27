import axios from 'axios';
import type { Trip, Location, Photo, Expense, Track } from '../types';

const BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  withCredentials: true, // session cookie when the API is on another origin
});

// A 401 outside /auth means the session expired: tell the app to show the login
export const AUTH_EXPIRED_EVENT = 'travel-tracker:auth-expired';
api.interceptors.response.use(undefined, (error) => {
  if (error.response?.status === 401 && !error.config?.url?.startsWith('/auth/')) {
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }
  return Promise.reject(error);
});

// ─── Auth ─────────────────────────────────────────────────────────────────────
export interface AuthStatus {
  authRequired: boolean;
  authenticated: boolean;
}

export const authApi = {
  me: () => api.get<AuthStatus>('/auth/me'),
  login: (username: string, password: string) =>
    api.post<AuthStatus>('/auth/login', { username, password }),
  logout: () => api.post<AuthStatus>('/auth/logout'),
};

// ─── Trips ────────────────────────────────────────────────────────────────────
export const tripsApi = {
  getAll: () => api.get<Trip[]>('/trips'),

  getById: (id: number) => api.get<Trip>(`/trips/${id}`),

  create: (formData: FormData) =>
    api.post<Trip>('/trips', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  update: (id: number, formData: FormData) =>
    api.put<Trip>(`/trips/${id}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  delete: (id: number) => api.delete<{ message: string }>(`/trips/${id}`),

  /** ZIP with the original files, trip.json, expenses.csv and tracks (plain link: streamed to disk) */
  exportUrl: (id: number) => `${BASE_URL}/trips/${id}/export`,

  share: (id: number) => api.post<{ share_token: string }>(`/trips/${id}/share`),
  unshare: (id: number) => api.delete<{ share_token: null }>(`/trips/${id}/share`),
};

// ─── Shared trips (public, read-only) ─────────────────────────────────────────
export const publicApi = {
  getTrip: (token: string) => api.get<Trip>(`/public/trips/${token}`),
};

// ─── Expenses ─────────────────────────────────────────────────────────────────
export type ExpenseInput = Partial<Pick<Expense, 'date' | 'category' | 'description' | 'amount' | 'currency' | 'location_id'>>;

export const expensesApi = {
  list: (tripId: number) => api.get<Expense[]>(`/trips/${tripId}/expenses`),
  create: (tripId: number, data: ExpenseInput) => api.post<Expense>(`/trips/${tripId}/expenses`, data),
  update: (tripId: number, id: number, data: ExpenseInput) => api.put<Expense>(`/trips/${tripId}/expenses/${id}`, data),
  delete: (tripId: number, id: number) => api.delete(`/trips/${tripId}/expenses/${id}`),
};

// ─── GPX / KML tracks ─────────────────────────────────────────────────────────
export const tracksApi = {
  upload: (tripId: number, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<Track>(`/trips/${tripId}/tracks`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  delete: (tripId: number, id: number) => api.delete(`/trips/${tripId}/tracks/${id}`),
};

// ─── Backup ───────────────────────────────────────────────────────────────────
export const backupApi = {
  /** Plain link: the browser streams the ZIP to disk. */
  downloadUrl: () => `${BASE_URL}/backup`,
  restore: (file: File, onProgress?: (fraction: number) => void) => {
    const form = new FormData();
    form.append('backup', file);
    return api.post<{ message: string; files: number; trips: number; previous_database: string }>('/backup/restore', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 0,
      onUploadProgress: (e) => onProgress?.(e.total ? e.loaded / e.total : 0),
    });
  },
};

// ─── Locations ────────────────────────────────────────────────────────────────
export const locationsApi = {
  getByTrip: (tripId: number) =>
    api.get<Location[]>(`/trips/${tripId}/locations`),

  create: (tripId: number, data: Omit<Location, 'id' | 'trip_id' | 'photos'>) =>
    api.post<Location>(`/trips/${tripId}/locations`, data),

  update: (tripId: number, locationId: number, data: Partial<Location>) =>
    api.put<Location>(`/trips/${tripId}/locations/${locationId}`, data),

  delete: (tripId: number, locationId: number) =>
    api.delete<{ message: string }>(`/trips/${tripId}/locations/${locationId}`),

  reorder: (tripId: number, order: Array<{ id: number; order_index: number }>) =>
    api.post(`/trips/${tripId}/locations/reorder`, { order }),
};

// ─── Photos ───────────────────────────────────────────────────────────────────
export const photosApi = {
  upload: (tripId: number, files: File[], locationId?: number, caption?: string) => {
    const formData = new FormData();
    files.forEach((f) => formData.append('photos', f));
    if (locationId != null) formData.append('location_id', String(locationId));
    if (caption) formData.append('caption', caption);
    return api.post<Photo[]>(`/trips/${tripId}/photos`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 0, // big videos can take a while to upload
    });
  },

  updateCaption: (tripId: number, photoId: number, caption: string) =>
    api.patch<Photo>(`/trips/${tripId}/photos/${photoId}`, { caption }),

  delete: (tripId: number, photoId: number) =>
    api.delete<{ message: string }>(`/trips/${tripId}/photos/${photoId}`),
};

// ─── Geocoding (OpenStreetMap Nominatim — free, no API key) ──────────────────
export const geocode = async (query: string) => {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`,
    { headers: { 'Accept-Language': 'en' } }
  );
  if (!res.ok) throw new Error('Geocoding failed');
  return res.json();
};

// ─── Image URL helpers ────────────────────────────────────────────────────────
// A shared (read-only) trip page loads files through its share link instead
let mediaPrefix: string | null = null;
export const setSharedMediaToken = (token: string | null) => {
  mediaPrefix = token ? `${BASE_URL}/public/${token}/media` : null;
};

export const getImageUrl = (filename: string): string => {
  if (mediaPrefix) return `${mediaPrefix}/${filename}`;
  const base = import.meta.env.VITE_API_URL || '';
  return `${base}/uploads/${filename}`;
};

/** Small preview (poster frame for videos); falls back to the full image. */
export const thumbUrl = (photo: Photo): string => getImageUrl(photo.thumb_filename ?? photo.filename);

/** The file to show/play in the browser. */
export const mediaUrl = (photo: Photo): string => getImageUrl(photo.filename);

/** The file exactly as it was uploaded (HEIC, MOV…). */
export const originalUrl = (photo: Photo): string =>
  // Share links only expose the browser-friendly files
  getImageUrl(mediaPrefix ? photo.filename : photo.original_filename ?? photo.filename);

/** Every photo/video of a trip: general ones plus each location's, in time order. */
export const allMedia = (trip: Trip): Photo[] =>
  [...(trip.photos ?? []), ...(trip.locations ?? []).flatMap((l) => l.photos ?? [])]
    .sort((a, b) => (a.taken_at ?? a.created_at).localeCompare(b.taken_at ?? b.created_at) || a.id - b.id);
