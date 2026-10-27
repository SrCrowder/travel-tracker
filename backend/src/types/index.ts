// Rows as stored in SQLite
export type TripStatus = 'done' | 'planned' | 'wishlist';

export interface TripRow {
  id: number;
  title: string;
  description: string;
  start_date: string | null; // null only for wishlist trips
  end_date: string | null;
  status: TripStatus;
  share_token: string | null;
  budget: number | null;
  currency: string;
  cover_image: string | null;
  cover_position_x: number;
  cover_position_y: number;
  tags: string; // JSON array
  created_at: string;
}

export interface LocationRow {
  id: number;
  trip_id: number;
  name: string;
  country: string;
  country_code: string | null; // ISO 3166-1 alpha-2, for the world map
  lat: number;
  lng: number;
  date_start: string | null;
  date_end: string | null;
  description: string;
  notes: string;
  order_index: number;
  rating: number | null;
}

/** A photo or a video (media_type). */
export interface PhotoRow {
  id: number;
  location_id: number | null;
  trip_id: number;
  media_type: 'image' | 'video';
  status: 'ready' | 'processing' | 'failed';
  filename: string;                 // browser-friendly file (JPEG/MP4 copy if the original isn't)
  original_filename: string | null; // untouched upload when it differs from filename (HEIC, MOV…)
  thumb_filename: string | null;
  original_name: string;            // name of the file on the user's device
  caption: string;
  taken_at: string | null;          // local time from EXIF / video tags
  taken_offset: string | null;
  lat: number | null;
  lng: number | null;
  camera: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;          // seconds (videos)
  attempts: number;                 // background processing tries so far
  error: string | null;             // last processing error
  geo_source: 'exif' | 'manual' | 'estimated' | null;
  created_at: string;
}

export interface ExpenseRow {
  id: number;
  trip_id: number;
  location_id: number | null;
  date: string | null;
  category: string;
  description: string;
  amount: number;
  currency: string;
  created_at: string;
}

export interface TrackRow {
  id: number;
  trip_id: number;
  name: string;
  geojson: string; // FeatureCollection of LineStrings
  distance_m: number;
  created_at: string;
}

// Shapes returned by the API
export interface Trip extends Omit<TripRow, 'tags'> {
  tags: string[];
}

export interface LocationWithPhotos extends LocationRow {
  photos: PhotoRow[];
}

export interface Track extends Omit<TrackRow, 'geojson'> {
  geojson: unknown;
}

export interface TripWithRelations extends Trip {
  locations: LocationWithPhotos[];
  photos: PhotoRow[];
  tracks: Track[];
}
