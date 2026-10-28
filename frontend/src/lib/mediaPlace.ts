import type { Location, Photo } from '../types';

// A photo this close to a place of the trip was taken there
const NEAR_KM = 30;

function distanceKm(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(h));
}

/**
 * Where a photo/video was taken, for the viewer: its place, else the nearest
 * place of the trip, else its coordinates.
 */
export function mediaPlaceName(locations: Location[]): (photo: Photo) => string | undefined {
  const byId = new Map(locations.map((l) => [l.id, l]));
  return (photo) => {
    const own = photo.location_id ? byId.get(photo.location_id) : undefined;
    if (own) return own.name;
    if (photo.lat == null || photo.lng == null) return undefined;
    let best: { km: number; name: string } | null = null;
    for (const l of locations) {
      const km = distanceKm([photo.lat, photo.lng], [l.lat, l.lng]);
      if (km <= NEAR_KM && (!best || km < best.km)) best = { km, name: l.name };
    }
    return best?.name ?? `${photo.lat.toFixed(4)}, ${photo.lng.toFixed(4)}`;
  };
}
