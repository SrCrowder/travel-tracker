import { DOMParser } from '@xmldom/xmldom';
import { gpx, kml } from '@tmcw/togeojson';

type Position = number[];
interface LineFeature {
  type: 'Feature';
  properties: { name?: string };
  geometry: { type: 'LineString'; coordinates: Position[] };
}

export interface ParsedTrack {
  name: string;
  geojson: { type: 'FeatureCollection'; features: LineFeature[] };
  distance_m: number;
}

// Long recordings (a point every second) are thinned out: enough for the map,
// small enough to send with every trip.
const MAX_POINTS = 5000;

function haversine(a: Position, b: Position): number {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLng = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

function lineLength(coords: Position[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += haversine(coords[i - 1], coords[i]);
  return total;
}

function thin(coords: Position[], keepEvery: number): Position[] {
  if (keepEvery <= 1) return coords;
  const out = coords.filter((_, i) => i % keepEvery === 0);
  if (out[out.length - 1] !== coords[coords.length - 1]) out.push(coords[coords.length - 1]);
  return out;
}

/** Parses a GPX or KML file into its lines (tracks/routes); points are ignored. */
export function parseTrackFile(content: string, fallbackName: string): ParsedTrack {
  const doc = new DOMParser({ onError: () => undefined }).parseFromString(content, 'text/xml');
  const root = doc.documentElement?.nodeName?.toLowerCase();
  if (root !== 'gpx' && root !== 'kml') throw new Error('Not a GPX or KML file');

  // togeojson expects a browser Document; xmldom's is compatible
  const collection = (root === 'gpx' ? gpx : kml)(doc as unknown as Parameters<typeof gpx>[0]);

  const lines: Array<{ name?: string; coords: Position[] }> = [];
  for (const feature of collection.features) {
    const geometry = feature.geometry;
    const name = typeof feature.properties?.name === 'string' ? feature.properties.name : undefined;
    if (geometry?.type === 'LineString') lines.push({ name, coords: geometry.coordinates });
    if (geometry?.type === 'MultiLineString') geometry.coordinates.forEach((c: Position[]) => lines.push({ name, coords: c }));
  }
  const valid = lines
    .map((l) => ({ ...l, coords: l.coords.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])).map((p) => [p[0], p[1]]) }))
    .filter((l) => l.coords.length >= 2);
  if (valid.length === 0) throw new Error('The file has no tracks or routes');

  const totalPoints = valid.reduce((n, l) => n + l.coords.length, 0);
  const keepEvery = Math.ceil(totalPoints / MAX_POINTS);
  const distance = valid.reduce((sum, l) => sum + lineLength(l.coords), 0);

  return {
    name: valid.find((l) => l.name)?.name ?? fallbackName,
    distance_m: Math.round(distance),
    geojson: {
      type: 'FeatureCollection',
      features: valid.map((l) => ({
        type: 'Feature',
        properties: l.name ? { name: l.name } : {},
        geometry: { type: 'LineString', coordinates: thin(l.coords, keepEvery) },
      })),
    },
  };
}
