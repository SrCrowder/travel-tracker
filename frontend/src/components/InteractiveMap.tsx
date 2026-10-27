import { useEffect, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  GeoJSON,
  Tooltip,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { motion } from 'framer-motion';
import { Loader2, Images } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { thumbUrl } from '../api/client';
import type { Location, Photo, Track } from '../types';

const TRACK_COLOR = '#EA580C';

// Fix Leaflet's broken default icon paths in Vite/webpack
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
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

function createMediaIcon(photo: Photo): L.DivIcon {
  const play = photo.media_type === 'video' ? '<div class="media-marker-play">▶</div>' : '';
  return L.divIcon({
    className: '',
    html: `<div class="media-marker"><img src="${thumbUrl(photo)}" alt="" loading="lazy" />${play}</div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

// Groups nearby photos: the newest thumbnail with the number of items
function createClusterIcon(cluster: { getChildCount(): number; getAllChildMarkers(): L.Marker[] }): L.DivIcon {
  const first = cluster.getAllChildMarkers()[0]?.options as { photoThumb?: string } | undefined;
  return L.divIcon({
    className: '',
    html: `<div class="media-cluster" style="background-image:url('${first?.photoThumb ?? ''}')"><span>${cluster.getChildCount()}</span></div>`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  });
}

// Fits the map to the points whenever they change
function AutoBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map((p) => p.join(',')).join('|');

  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 10, { animate: true });
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [60, 60], animate: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);

  return null;
}

type RouteMode = 'straight' | 'roads';

interface InteractiveMapProps {
  locations: Location[];
  selectedLocation: Location | null;
  onLocationSelect: (location: Location) => void;
  /** Photos/videos with GPS are shown as thumbnails; click opens them */
  media?: Photo[];
  onMediaClick?: (photo: Photo) => void;
  /** GPS tracks drawn as lines */
  tracks?: Track[];
  height?: string;
}

export default function InteractiveMap({
  locations,
  selectedLocation,
  onLocationSelect,
  media = [],
  onMediaClick,
  tracks = [],
  height = '520px',
}: InteractiveMapProps) {
  const { t } = useTranslation();
  const [routeMode, setRouteMode] = useState<RouteMode>('straight');
  const geotagged = media.filter((p) => p.lat != null && p.lng != null);
  const [showMedia, setShowMedia] = useState(true);
  const [roadPath, setRoadPath] = useState<[number, number][] | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);

  const sorted = [...locations].sort((a, b) => a.order_index - b.order_index);
  const routePoints: [number, number][] = sorted.map((l) => [l.lat, l.lng]);
  const mediaPoints: [number, number][] = geotagged.map((p) => [p.lat!, p.lng!]);
  const trackPoints: [number, number][] = tracks.flatMap((t) =>
    t.geojson.features.flatMap((f) => {
      const c = f.geometry.coordinates;
      return [c[0], c[c.length - 1]].map(([lng, lat]) => [lat, lng] as [number, number]);
    }));
  // Frame the route (and tracks); with neither, frame the photos instead
  const framePoints = routePoints.length + trackPoints.length > 0 ? [...routePoints, ...trackPoints] : showMedia ? mediaPoints : [];
  const center: [number, number] = framePoints[0] ?? [20, 0];

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
        zoom={framePoints.length === 0 ? 3 : 6}
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

        {/* GPS tracks */}
        {tracks.map((track) => (
          <GeoJSON key={`track-${track.id}`} data={track.geojson}
            style={{ color: TRACK_COLOR, weight: 3.5, opacity: 0.85 }}>
            <Tooltip sticky>{track.name}</Tooltip>
          </GeoJSON>
        ))}

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

        {/* Photo / video markers */}
        {showMedia && geotagged.length > 0 && (
          <MarkerClusterGroup
            chunkedLoading
            showCoverageOnHover={false}
            maxClusterRadius={50}
            iconCreateFunction={createClusterIcon}
          >
            {geotagged.map((photo) => (
              <Marker
                key={`media-${photo.id}`}
                position={[photo.lat!, photo.lng!]}
                icon={createMediaIcon(photo)}
                // read back by createClusterIcon
                {...({ photoThumb: thumbUrl(photo) } as object)}
                eventHandlers={{ click: () => onMediaClick?.(photo) }}
              />
            ))}
          </MarkerClusterGroup>
        )}

        <AutoBounds points={framePoints} />
      </MapContainer>

      {/* Photos layer toggle */}
      {geotagged.length > 0 && (
        <button
          onClick={() => setShowMedia((v) => !v)}
          className={`absolute top-3 left-3 z-[1000] flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl shadow-lg border transition-colors ${
            showMedia
              ? 'bg-primary-600 border-primary-600 text-white'
              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
          }`}
        >
          <Images size={13} />
          {t('map.photos', { count: geotagged.length })}
        </button>
      )}

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
