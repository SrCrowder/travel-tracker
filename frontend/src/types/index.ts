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

export interface Trip {
  id: number;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
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
    city?: string;
    town?: string;
    state?: string;
  };
}

export type TabType = 'map' | 'timeline' | 'photos';
