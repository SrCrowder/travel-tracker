import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence } from 'framer-motion';
import { Calendar, Compass, MapPin, LogOut } from 'lucide-react';
import { isAxiosError } from 'axios';
import { useTranslation } from 'react-i18next';
import { publicApi, authApi, getImageUrl, allMedia, setSharedMediaToken } from '../api/client';
import InteractiveMap from '../components/InteractiveMap';
import Timeline from '../components/Timeline';
import PhotoGallery from '../components/PhotoGallery';
import Lightbox from '../components/Lightbox';
import LoadingSpinner from '../components/LoadingSpinner';
import DarkModeToggle from '../components/DarkModeToggle';
import { useDateLocale } from '../i18n/useDateLocale';
import { formatTripRange } from '../lib/tripDates';
import { mediaPlaceName } from '../lib/mediaPlace';
import { useLogout } from '../hooks/useLogout';
import Login from './Login';
import type { Photo } from '../types';

type TabId = 'map' | 'timeline' | 'photos';

/** Read-only page of a trip opened through its share link (login: admin or one of the admin's users). */
export default function SharedTrip() {
  const { token = '' } = useParams<{ token: string }>();
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const [tab, setTab] = useState<TabId>('map');
  const [lightbox, setLightbox] = useState<{ photos: Photo[]; index: number } | null>(null);
  const [mapFocus, setMapFocus] = useState<Photo | null>(null);
  const logout = useLogout();

  // Images and videos of this page come through the share link
  setSharedMediaToken(token);
  useEffect(() => () => setSharedMediaToken(null), []);

  const { data: trip, isLoading, isError, error } = useQuery({
    queryKey: ['shared', token],
    queryFn: () => publicApi.getTrip(token).then((r) => r.data),
    retry: false,
  });
  const { data: auth } = useQuery({ queryKey: ['auth'], queryFn: () => authApi.me().then((r) => r.data), staleTime: Infinity });

  if (isLoading) return <LoadingSpinner message={t('common.loading')} />;
  // With the login on, the link only opens after logging in
  if (isError && isAxiosError(error) && error.response?.status === 401) return <Login subtitle={t('auth.shareSubtitle')} />;
  if (isError || !trip) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center p-6">
        <Compass size={32} className="text-primary-400" />
        <p className="text-slate-600 dark:text-slate-300">{t('share.invalid')}</p>
      </div>
    );
  }

  const locations = [...trip.locations].sort((a, b) => a.order_index - b.order_index);
  const media = allMedia(trip);
  const geotagged = media.filter((p) => p.lat != null && p.lng != null);
  const placeName = mediaPlaceName(locations);

  return (
    <>
      <header className="relative h-56 md:h-72 overflow-hidden">
        {trip.cover_image
          ? <img src={getImageUrl(trip.cover_image)} alt="" className="w-full h-full object-cover"
            style={{ objectPosition: `${trip.cover_position_x ?? 50}% ${trip.cover_position_y ?? 50}%` }} />
          : <div className="w-full h-full bg-gradient-to-br from-primary-600 via-primary-700 to-indigo-800" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <DarkModeToggle />
          {auth?.authRequired && auth.authenticated && (
            <button onClick={logout} title={t('auth.logout')} aria-label={t('auth.logout')}
              className="w-9 h-9 rounded-full bg-black/30 hover:bg-black/50 backdrop-blur-sm flex items-center justify-center text-white">
              <LogOut size={16} />
            </button>
          )}
        </div>
        <div className="absolute bottom-0 inset-x-0 p-6 md:p-8">
          <p className="text-xs uppercase tracking-widest text-white/60 mb-2">{t('share.sharedTrip')}</p>
          <h1 className="font-playfair text-3xl md:text-5xl font-bold text-white mb-2">{trip.title}</h1>
          <div className="flex flex-wrap gap-4 text-white/80 text-sm">
            {formatTripRange(trip, dateLocale) && (
              <span className="flex items-center gap-1.5"><Calendar size={14} />{formatTripRange(trip, dateLocale)}</span>
            )}
            {locations.length > 0 && (
              <span className="flex items-center gap-1.5"><MapPin size={14} />{t('tripDetail.locations', { count: locations.length })}</span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {trip.description && <p className="text-slate-600 dark:text-slate-300 text-lg leading-relaxed max-w-3xl mb-8">{trip.description}</p>}

        <div className="flex gap-1 mb-6 bg-white dark:bg-slate-800 p-1 rounded-xl w-fit shadow-card">
          {(['map', 'timeline', 'photos'] as TabId[]).map((id) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === id ? 'bg-primary-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-primary-600'
              }`}>
              {t(`tripDetail.tabs.${id}`)}
            </button>
          ))}
        </div>

        {tab === 'map' && (
          <InteractiveMap
            locations={locations}
            selectedLocation={null}
            onLocationSelect={() => undefined}
            media={geotagged}
            tracks={trip.tracks}
            focus={mapFocus}
            onMediaClick={(photo) => setLightbox({ photos: geotagged, index: geotagged.findIndex((p) => p.id === photo.id) })}
          />
        )}
        {tab === 'timeline' && <Timeline trip={trip} />}
        {tab === 'photos' && <PhotoGallery trip={trip} readOnly />}
      </main>

      <AnimatePresence>
        {lightbox && (
          <Lightbox photos={lightbox.photos} startIndex={lightbox.index} placeName={placeName}
            onPhotoChange={setMapFocus} onClose={() => { setLightbox(null); setMapFocus(null); }} />
        )}
      </AnimatePresence>
    </>
  );
}
