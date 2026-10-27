/** A photo or a video (media_type). */
export interface Photo {
  id: number;
  location_id?: number | null;
  trip_id: number;
  media_type: 'image' | 'video';
  /** Videos are converted in the background: processing → ready / failed */
  status: 'ready' | 'processing' | 'failed';
  /** Browser-friendly file (JPEG / MP4 copy when the original isn't) */
  filename: string;
  /** The untouched upload (HEIC, MOV…) when it differs from filename */
  original_filename?: string | null;
  thumb_filename?: string | null;
  original_name: string;
  caption?: string;
  /** Local time it was taken, "YYYY-MM-DDTHH:MM:SS" */
  taken_at?: string | null;
  taken_offset?: string | null;
  lat?: number | null;
  lng?: number | null;
  camera?: string | null;
  width?: number | null;
  height?: number | null;
  /** Seconds (videos) */
  duration?: number | null;
  created_at: string;
}

export interface Location {
  id: number;
  trip_id: number;
  name: string;
  country: string;
  /** ISO 3166-1 alpha-2 (for the world map) */
  country_code?: string | null;
  lat: number;
  lng: number;
  date_start?: string;
  date_end?: string;
  description?: string;
  notes?: string;
  order_index: number;
  rating?: number | null;
  photos: Photo[];
}

export type TripStatus = 'done' | 'planned' | 'wishlist';

export interface Track {
  id: number;
  trip_id: number;
  name: string;
  geojson: GeoJSON.FeatureCollection<GeoJSON.LineString>;
  distance_m: number;
  created_at: string;
}

export interface Expense {
  id: number;
  trip_id: number;
  location_id: number | null;
  date: string | null;
  category: ExpenseCategory;
  description: string;
  amount: number;
  currency: string;
  created_at: string;
}

export const EXPENSE_CATEGORIES = ['transport', 'lodging', 'food', 'activities', 'shopping', 'other'] as const;
export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

export interface Trip {
  id: number;
  title: string;
  description: string;
  /** null only for wishlist trips */
  start_date: string | null;
  end_date: string | null;
  status: TripStatus;
  share_token?: string | null;
  budget?: number | null;
  currency: string;
  tracks?: Track[];
  cover_image?: string | null;
  cover_position_x?: number;
  cover_position_y?: number;
  tags: string[];
  locations: Location[];
  photos?: Photo[];
  created_at: string;
}

export interface TripDate {
  date: Date;
  tripId: number;
  tripTitle: string;
}

export interface GeocodingResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    country?: string;
    country_code?: string;
    city?: string;
    town?: string;
    state?: string;
  };
}

export type TabType = 'map' | 'timeline' | 'photos';
