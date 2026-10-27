import { useEffect, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Location } from '../types';

// Fix Leaflet's broken default icon paths in Vite/webpack
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

function createPinIcon(index: number, isSelected: boolean): L.DivIcon {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div class="marker-pin ${isSelected ? 'selected' : ''}" style="background:${isSelected ? '#F59E0B' : '#4F46E5'}">${index + 1}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  });
}

// Fits the map to the location bounds whenever locations change
function AutoBounds({ locations }: { locations: Location[] }) {
  const map = useMap();

  useEffect(() => {
    if (locations.length === 0) return;
    if (locations.length === 1) {
      map.setView([locations[0].lat, locations[0].lng], 10, { animate: true });
      return;
    }
    const bounds = L.latLngBounds(locations.map((l) => [l.lat, l.lng]));
    map.fitBounds(bounds, { padding: [60, 60], animate: true });
  }, [locations, map]);

  return null;
}

type RouteMode = 'straight' | 'roads';

interface InteractiveMapProps {
  locations: Location[];
  selectedLocation: Location | null;
  onLocationSelect: (location: Location) => void;
  height?: string;
}

export default function InteractiveMap({
  locations,
  selectedLocation,
  onLocationSelect,
  height = '520px',
}: InteractiveMapProps) {
  const { t } = useTranslation();
  const [routeMode, setRouteMode] = useState<RouteMode>('straight');
  const [roadPath, setRoadPath] = useState<[number, number][] | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);

  const sorted = [...locations].sort((a, b) => a.order_index - b.order_index);
  const routePoints: [number, number][] = sorted.map((l) => [l.lat, l.lng]);
  const center: [number, number] =
    sorted.length > 0 ? [sorted[0].lat, sorted[0].lng] : [20, 0];

  // Stable key — re-fetch only when coordinates actually change
  const coordsKey = routePoints.map(([lat, lng]) => `${lat},${lng}`).join('|');

  useEffect(() => {
    if (routeMode !== 'roads' || sorted.length < 2) {
      setRoadPath(null);
      setLoadingRoute(false);
      return;
    }

    let cancelled = false;
    const osrmCoords = sorted.map((l) => `${l.lng},${l.lat}`).join(';');
    setLoadingRoute(true);
    setRoadPath(null);

    fetch(
      `https://router.project-osrm.org/route/v1/driving/${osrmCoords}?overview=full&geometries=geojson`
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const coords = data.routes?.[0]?.geometry?.coordinates;
        if (coords) {
          setRoadPath(coords.map(([lng, lat]: [number, number]) => [lat, lng]));
        }
      })
      .catch(() => { if (!cancelled) setRoadPath(null); })
      .finally(() => { if (!cancelled) setLoadingRoute(false); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeMode, coordsKey]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.99 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="relative rounded-2xl overflow-hidden shadow-card border border-slate-200 dark:border-slate-700"
      style={{ height }}
    >
      <MapContainer
        center={center}
        zoom={sorted.length === 0 ? 3 : 6}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        {/* OpenStreetMap tiles — free, no API key */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {routePoints.length > 1 && (
          <>
            {/* Straight-line polyline — shown in straight mode, or as fallback while road route loads */}
            {(routeMode === 'straight' || (routeMode === 'roads' && !roadPath)) && (
              <Polyline
                positions={routePoints}
                pathOptions={{
                  color: '#4F46E5',
                  weight: 2.5,
                  opacity: 0.65,
                  dashArray: routeMode === 'straight' ? '10, 8' : '6, 6',
                }}
              />
            )}

            {/* Road route polyline */}
            {routeMode === 'roads' && roadPath && (
              <Polyline
                positions={roadPath}
                pathOptions={{
                  color: '#4F46E5',
                  weight: 3,
                  opacity: 0.8,
                }}
              />
            )}
          </>
        )}

        {/* Location markers */}
        {sorted.map((location, index) => (
          <Marker
            key={location.id}
            position={[location.lat, location.lng]}
            icon={createPinIcon(index, selectedLocation?.id === location.id)}
            eventHandlers={{ click: () => onLocationSelect(location) }}
            zIndexOffset={selectedLocation?.id === location.id ? 1000 : 0}
          >
            <Popup closeButton={false} className="min-w-[160px]">
              <div className="py-1">
                <p className="font-semibold text-sm text-slate-800">{location.name}</p>
                {location.country && (
                  <p className="text-xs text-slate-500 mt-0.5">{location.country}</p>
                )}
                {location.rating && (
                  <div className="flex gap-0.5 mt-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span
                        key={i}
                        className={i < (location.rating ?? 0) ? 'text-amber-400' : 'text-slate-200'}
                        style={{ fontSize: '11px' }}
                      >
                        ★
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        <AutoBounds locations={sorted} />
      </MapContainer>

      {/* Route mode toggle — only shown when there are at least 2 locations */}
      {sorted.length > 1 && (
        <div className="absolute top-3 right-3 z-[1000] flex items-center bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          <button
            onClick={() => setRouteMode('straight')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              routeMode === 'straight'
                ? 'bg-primary-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            {t('map.straightLine')}
          </button>
          <div className="w-px h-4 bg-slate-200 dark:bg-slate-600 shrink-0" />
          <button
            onClick={() => setRouteMode('roads')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 ${
              routeMode === 'roads'
                ? 'bg-primary-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            {loadingRoute && <Loader2 size={11} className="animate-spin" />}
            {t('map.roads')}
          </button>
        </div>
      )}
    </motion.div>
  );
}
