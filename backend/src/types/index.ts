// Rows as stored in SQLite
export interface TripRow {
  id: number;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
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
  lat: number;
  lng: number;
  date_start: string | null;
  date_end: string | null;
  description: string;
  notes: string;
  order_index: number;
  rating: number | null;
}

export interface PhotoRow {
  id: number;
  location_id: number | null;
  trip_id: number;
  filename: string;
  original_name: string;
  caption: string;
  created_at: string;
}

// Shapes returned by the API
export interface Trip extends Omit<TripRow, 'tags'> {
  tags: string[];
}

export interface LocationWithPhotos extends LocationRow {
  photos: PhotoRow[];
}

export interface TripWithRelations extends Trip {
  locations: LocationWithPhotos[];
  photos: PhotoRow[];
}
