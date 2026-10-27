export interface Trip {
  id: number;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  cover_image?: string;
  tags: string; // JSON string in DB, parsed to string[] in API response
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
  rating?: number;
}

export interface Photo {
  id: number;
  location_id?: number;
  trip_id: number;
  filename: string;
  original_name: string;
  caption?: string;
  created_at: string;
}

export interface TripWithRelations extends Trip {
  locations: LocationWithPhotos[];
  photos: Photo[];
}

export interface LocationWithPhotos extends Location {
  photos: Photo[];
}
