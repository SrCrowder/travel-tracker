import { useEffect, useMemo, useState } from 'react';
import { MapContainer, GeoJSON } from 'react-leaflet';
import type { Layer, PathOptions } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import { Globe2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { countryName, countryVisits, numericCode } from '../lib/countries';
import { useStore } from '../store/useStore';
import type { Trip } from '../types';

type Countries = GeoJSON.FeatureCollection<GeoJSON.Geometry, { name: string }>;

// Rings that cross the 180° meridian (Russia, Fiji…) jump from +180 to -180
// and Leaflet draws a stripe across the map: move their western part east.
function unwrapRing(ring: GeoJSON.Position[]): GeoJSON.Position[] {
  const crosses = ring.some(([lng]) => lng > 150) && ring.some(([lng]) => lng < -150);
  return crosses ? ring.map(([lng, lat]) => [lng < 0 ? lng + 360 : lng, lat]) : ring;
}

function unwrap(geometry: GeoJSON.Geometry): GeoJSON.Geometry {
  if (geometry.type === 'Polygon') return { ...geometry, coordinates: geometry.coordinates.map(unwrapRing) };
  if (geometry.type === 'MultiPolygon') {
    return { ...geometry, coordinates: geometry.coordinates.map((poly) => poly.map(unwrapRing)) };
  }
  return geometry;
}

const ANTARCTICA = '010';

// Sovereign states, for the "% of the world" figure
const WORLD_COUNTRIES = 195;

export default function WorldMap({ trips }: { trips: Trip[] }) {
  const { t, i18n } = useTranslation();
  const { darkMode } = useStore();
  const [shapes, setShapes] = useState<Countries | null>(null);

  // The outlines (~100 KB) load only when the map is shown
  useEffect(() => {
    import('world-atlas/countries-110m.json').then((mod) => {
      const topology = mod.default as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
      const all = feature(topology, topology.objects.countries) as Countries;
      setShapes({
        ...all,
        features: all.features
          .filter((f) => String(f.id) !== ANTARCTICA)
          .map((f) => ({ ...f, geometry: unwrap(f.geometry) })),
      });
    });
  }, []);

  const { visited, planned } = useMemo(() => countryVisits(trips), [trips]);
  const byNumeric = useMemo(() => {
    const map = new Map<string, { code: string; kind: 'visited' | 'planned'; trips: Trip[] }>();
    for (const [code, list] of visited) { const n = numericCode(code); if (n) map.set(n, { code, kind: 'visited', trips: list }); }
    for (const [code, list] of planned) { const n = numericCode(code); if (n) map.set(n, { code, kind: 'planned', trips: list }); }
    return map;
  }, [visited, planned]);

  const style = (f?: GeoJSON.Feature): PathOptions => {
    const entry = byNumeric.get(String(f?.id));
    if (entry?.kind === 'visited') return { fillColor: '#4F46E5', fillOpacity: 0.55, color: '#4338CA', weight: 1 };
    if (entry?.kind === 'planned') return { fillColor: '#F59E0B', fillOpacity: 0.35, color: '#D97706', weight: 1, dashArray: '3 3' };
    // Every other country is drawn too: the map needs no tile server
    return darkMode
      ? { fillColor: '#334155', fillOpacity: 1, color: '#1e293b', weight: 0.6 }
      : { fillColor: '#e2e8f0', fillOpacity: 1, color: '#ffffff', weight: 0.6 };
  };

  const onEach = (f: GeoJSON.Feature, layer: Layer) => {
    const entry = byNumeric.get(String(f.id));
    if (!entry) return;
    // Built from text nodes: trip titles are user input, never HTML
    const el = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = countryName(entry.code, i18n.language);
    el.append(name, document.createElement('br'), document.createTextNode(entry.trips.map((trip) => trip.title).join(', ')));
    layer.bindTooltip(el, { sticky: true });
  };

  const percent = Math.round((visited.size / WORLD_COUNTRIES) * 100);

  return (
    <section className="bg-white dark:bg-slate-800 rounded-2xl shadow-card overflow-hidden mb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <h2 className="font-playfair text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
          <Globe2 size={18} className="text-primary-500" />
          {t('worldMap.title')}
        </h2>
        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
          <span><strong className="text-slate-800 dark:text-white">{visited.size}</strong> {t('worldMap.visited', { count: visited.size })} · {percent}%</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-primary-500/70" />{t('worldMap.legendVisited')}</span>
          {planned.size > 0 && (
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-400/70" />{t('worldMap.legendPlanned')}</span>
          )}
        </div>
      </div>
      <div className="h-72 md:h-96 bg-sky-50 dark:bg-slate-900">
        <MapContainer center={[25, 10]} zoom={1.5} zoomSnap={0.25} minZoom={1} maxZoom={6} scrollWheelZoom={false}
          attributionControl={false} maxBounds={[[-75, -200], [88, 200]]}
          style={{ height: '100%', width: '100%', background: 'transparent' }}>
          {shapes && (
            // Re-mount when the data or theme changes so styles/tooltips update
            <GeoJSON key={`${[...byNumeric.keys()].join(',')}-${darkMode}`} data={shapes} style={style} onEachFeature={onEach} />
          )}
        </MapContainer>
      </div>
    </section>
  );
}
