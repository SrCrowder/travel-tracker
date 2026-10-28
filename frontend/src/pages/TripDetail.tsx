import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Calendar, MapPin, Clock, Tag, Trash2, MoreVertical, Pencil, ImagePlus, FileDown, Loader2, Images, Link2,
  Sparkles, CalendarClock, FolderDown, RefreshCw, AlertTriangle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { tripsApi, locationsApi, photosApi, getImageUrl, allMedia } from '../api/client';
import UnlocatedMediaPanel from '../components/UnlocatedMediaPanel';
import Navbar from '../components/Navbar';
import InteractiveMap from '../components/InteractiveMap';
import LocationPanel from '../components/LocationPanel';
import PhotoGallery from '../components/PhotoGallery';
import Timeline from '../components/Timeline';
import LoadingSpinner from '../components/LoadingSpinner';
import AddTripModal from '../components/AddTripModal';
import PhotoUploadModal from '../components/PhotoUploadModal';
import ImportPhotosModal from '../components/ImportPhotosModal';
import Lightbox from '../components/Lightbox';
import ShareDialog from '../components/ShareDialog';
import ExpensesPanel from '../components/ExpensesPanel';
import SortableLocationList from '../components/SortableLocationList';
import TracksPanel from '../components/TracksPanel';
import { formatTripRange, tripDays } from '../lib/tripDates';
import { useDateLocale } from '../i18n/useDateLocale';
import { useTripPdfExport } from '../hooks/useTripPdfExport';
import type { Trip, Location, Photo } from '../types';

const TAG_COLORS: Record<string, string> = {
  adventure: 'bg-orange-500/20 text-orange-200',
  food:      'bg-green-500/20 text-green-200',
  hiking:    'bg-lime-500/20 text-lime-200',
  culture:   'bg-purple-500/20 text-purple-200',
  beach:     'bg-sky-500/20 text-sky-200',
  city:      'bg-slate-500/20 text-slate-200',
  nature:    'bg-teal-500/20 text-teal-200',
  default:   'bg-white/20 text-white',
};

type TabId = 'map' | 'timeline' | 'photos' | 'expenses';
const TAB_IDS: TabId[] = ['map', 'timeline', 'photos', 'expenses'];

export default function TripDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { t } = useTranslation();
  const dateLocale = useDateLocale();

  const [activeTab, setActiveTab] = useState<TabId>('map');
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { exportPdf, exporting } = useTripPdfExport();
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadDefaultLocationId, setUploadDefaultLocationId] = useState<number | undefined>();
  const [importOpen, setImportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // Ids of the photos waiting for a click on the map (placing items without GPS)
  const [pickingIds, setPickingIds] = useState<number[] | null>(null);
  const [searchParams] = useSearchParams();
  const wantsLocate = searchParams.get('locate') === '1';
  const [mapLightbox, setMapLightbox] = useState<{ photos: Photo[]; index: number } | null>(null);

  const openUploadModal = (locationId?: number) => {
    setUploadDefaultLocationId(locationId);
    setUploadModalOpen(true);
  };

  const { data: trip, isLoading } = useQuery({
    queryKey: ['trip', id],
    queryFn: async () => {
      const res = await tripsApi.getById(Number(id));
      return res.data as Trip;
    },
    enabled: !!id,
    // Poll while a video is being converted so it appears as soon as it's ready
    refetchInterval: (query) =>
      query.state.data && allMedia(query.state.data).some((p) => p.status === 'processing') ? 4000 : false,
  });

  // When trip data refreshes after a location edit, keep selectedLocation in sync
  useEffect(() => {
    if (selectedLocation && trip?.locations) {
      const refreshed = trip.locations.find((l) => l.id === selectedLocation.id);
      if (refreshed) setSelectedLocation(refreshed);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip]);

  // Coming from the import ("place the photos without GPS"): open the map tab at the panel
  useEffect(() => {
    if (!wantsLocate || !trip) return;
    setActiveTab('map');
    const timer = setTimeout(() => document.getElementById('unlocated-media')?.scrollIntoView({ behavior: 'smooth' }), 600);
    return () => clearTimeout(timer);
  }, [wantsLocate, trip?.id]);

  const deleteTrip = useMutation({
    mutationFn: () => tripsApi.delete(Number(id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trips'] });
      navigate('/');
    },
  });

  const deleteLocation = useMutation({
    mutationFn: (locationId: number) => locationsApi.delete(Number(id), locationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trip', id] });
      setSelectedLocation(null);
    },
  });

  if (isLoading) return <><Navbar /><LoadingSpinner message={t('tripDetail.loading')} /></>;
  if (!trip) return <><Navbar /><div className="p-8 text-center text-slate-500">{t('tripDetail.notFound')}</div></>;

  const durationDays = tripDays(trip);
  const refreshTrip = () => qc.invalidateQueries({ queryKey: ['trip', id] });

  const placePicked = async (lat: number, lng: number) => {
    if (!pickingIds?.length) return;
    await photosApi.locate(trip.id, { ids: pickingIds, lat, lng, geo_source: 'manual' });
    setPickingIds(null);
    refreshTrip();
  };

  const reorderLocations = async (ordered: Location[]) => {
    await locationsApi.reorder(trip.id, ordered.map((l, i) => ({ id: l.id, order_index: i })));
    refreshTrip();
  };

  const sortedLocations = [...(trip.locations ?? [])].sort(
    (a, b) => a.order_index - b.order_index
  );
  const media = allMedia(trip);
  const geotaggedMedia = media.filter((p) => p.lat != null && p.lng != null);
  const locationName = new Map(sortedLocations.map((l) => [l.id, l.name]));
  const processing = media.filter((p) => p.status === 'processing').length;
  const failedMedia = media.filter((p) => p.status === 'failed').length;

  const handleDeleteTrip = () => {
    if (window.confirm(t('tripDetail.deleteConfirm', { title: trip.title }))) {
      deleteTrip.mutate();
    }
  };

  return (
    <>
      <Navbar />

      {/* ── Hero Banner ────────────────────────────────────────────────── */}
      <div className="relative h-64 md:h-80 lg:h-96 overflow-hidden">
        {trip.cover_image ? (
          <img
            src={getImageUrl(trip.cover_image)}
            alt={trip.title}
            className="w-full h-full object-cover"
            style={{ objectPosition: `${trip.cover_position_x ?? 50}% ${trip.cover_position_y ?? 50}%` }}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary-600 via-primary-700 to-indigo-800" />
        )}

        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />

        {/* Back button */}
        <motion.button
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={() => navigate('/')}
          className="absolute top-5 left-5 flex items-center gap-2 text-white bg-black/30 hover:bg-black/50 backdrop-blur-sm px-4 py-2 rounded-full text-sm font-medium transition-colors"
        >
          <ArrowLeft size={15} />
          {t('tripDetail.allTrips')}
        </motion.button>

        {/* Menu button */}
        <div className="absolute top-5 right-5">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="w-9 h-9 rounded-full bg-black/30 hover:bg-black/50 backdrop-blur-sm flex items-center justify-center text-white transition-colors"
          >
            <MoreVertical size={16} />
          </button>
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -4 }}
                className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden z-10"
              >
                <button
                  onClick={() => { setMenuOpen(false); setEditModalOpen(true); }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <Pencil size={15} />
                  {t('tripDetail.editTrip')}
                </button>
                <button
                  onClick={() => { setMenuOpen(false); setShareOpen(true); }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <Link2 size={15} />
                  {trip.share_token ? t('share.manage') : t('share.menu')}
                </button>
                <button
                  onClick={() => { setMenuOpen(false); setImportOpen(true); }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <Images size={15} />
                  {t('tripDetail.importMedia')}
                </button>
                <a
                  href={tripsApi.exportUrl(trip.id)}
                  download
                  onClick={() => setMenuOpen(false)}
                  title={t('tripDetail.exportRawHint')}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <FolderDown size={15} />
                  {t('tripDetail.exportRaw')}
                </a>
                <button
                  onClick={() => { setMenuOpen(false); exportPdf(trip); }}
                  disabled={exporting}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                >
                  {exporting ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />}
                  {exporting ? t('tripDetail.exportingPdf') : t('tripDetail.exportPdf')}
                </button>
                <button
                  onClick={() => { setMenuOpen(false); handleDeleteTrip(); }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <Trash2 size={15} />
                  {t('tripDetail.deleteTrip')}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Trip info overlay */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="absolute bottom-0 left-0 right-0 px-6 pb-6 md:px-8 md:pb-8"
        >
          {/* Status + tags */}
          {(trip.tags.length > 0 || trip.status !== 'done') && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {trip.status !== 'done' && (
                <span className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-semibold ${
                  trip.status === 'planned' ? 'bg-amber-400 text-amber-950' : 'bg-pink-500 text-white'
                }`}>
                  {trip.status === 'planned' ? <CalendarClock size={11} /> : <Sparkles size={11} />}
                  {t(`tripStatus.${trip.status}`)}
                </span>
              )}
              {trip.tags.map((tag) => (
                <span
                  key={tag}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full backdrop-blur-sm font-medium ${
                    TAG_COLORS[tag] ?? TAG_COLORS.default
                  }`}
                >
                  <Tag size={10} />
                  {t(`tags.${tag}`, tag)}
                </span>
              ))}
            </div>
          )}

          <h1 className="font-playfair text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-3 leading-tight">
            {trip.title}
          </h1>

          <div className="flex flex-wrap items-center gap-4 text-white/80 text-sm">
            <span className="flex items-center gap-1.5">
              <Calendar size={14} />
              {formatTripRange(trip, dateLocale) ?? t('tripCard.noDates')}
            </span>
            {durationDays !== null && (
              <span className="flex items-center gap-1.5">
                <Clock size={14} />
                {t('tripDetail.days', { count: durationDays })}
              </span>
            )}
            {sortedLocations.length > 0 && (
              <span className="flex items-center gap-1.5">
                <MapPin size={14} />
                {t('tripDetail.locations', { count: sortedLocations.length })}
              </span>
            )}
          </div>
        </motion.div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Description */}
        {trip.description && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="text-slate-600 dark:text-slate-300 text-lg leading-relaxed max-w-3xl mb-8"
          >
            {trip.description}
          </motion.p>
        )}

        {/* Background processing of photos/videos */}
        {(processing > 0 || failedMedia > 0) && (
          <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm rounded-xl px-4 py-3 bg-slate-100 dark:bg-slate-800">
            {processing > 0 && (
              <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <Loader2 size={15} className="animate-spin text-primary-500" />
                {t('media.processingCount', { count: processing })}
              </span>
            )}
            {failedMedia > 0 && (
              <span className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <AlertTriangle size={15} />
                {t('media.failedCount', { count: failedMedia })}
                <button onClick={async () => { await photosApi.retry(trip.id); refreshTrip(); }}
                  className="flex items-center gap-1 font-medium text-primary-600 hover:text-primary-700">
                  <RefreshCw size={13} /> {t('media.retry')}
                </button>
              </span>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white dark:bg-slate-800 p-1 rounded-xl w-fit max-w-full overflow-x-auto shadow-card">
          {TAB_IDS.map((tabId) => (
            <button
              key={tabId}
              onClick={() => { setActiveTab(tabId); if (tabId !== 'map') setSelectedLocation(null); }}
              className={`relative px-5 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
                activeTab === tabId
                  ? 'text-white'
                  : 'text-slate-500 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400'
              }`}
            >
              {activeTab === tabId && (
                <motion.div
                  layoutId="tab-pill"
                  className="absolute inset-0 bg-primary-600 rounded-lg"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                />
              )}
              <span className="relative z-10">{t(`tripDetail.tabs.${tabId}`)}</span>
              {tabId === 'photos' && media.length > 0 && (
                <span className="relative z-10 ml-1.5 text-xs opacity-70">({media.length})</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab panels */}
        <AnimatePresence mode="wait">

          {/* ── MAP TAB ── */}
          {activeTab === 'map' && (
            <motion.div
              key="map"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-6"
            >
              {/* Map */}
              <div className="lg:col-span-2">
                <InteractiveMap
                  locations={sortedLocations}
                  selectedLocation={selectedLocation}
                  onLocationSelect={(loc) =>
                    setSelectedLocation((prev) => (prev?.id === loc.id ? null : loc))
                  }
                  media={geotaggedMedia}
                  tracks={trip.tracks}
                  onPick={pickingIds ? placePicked : undefined}
                  onMediaClick={(photo) =>
                    setMapLightbox({ photos: geotaggedMedia, index: geotaggedMedia.findIndex((p) => p.id === photo.id) })
                  }
                />
              </div>

              {/* Side panel */}
              <div className="lg:col-span-1">
                <AnimatePresence mode="wait">
                  {selectedLocation ? (
                    <LocationPanel
                      key={selectedLocation.id}
                      location={selectedLocation}
                      tripId={trip.id}
                      onClose={() => setSelectedLocation(null)}
                      onAddPhotos={() => openUploadModal(selectedLocation.id)}
                      onLocationUpdated={() => qc.invalidateQueries({ queryKey: ['trip', id] })}
                    />
                  ) : (
                    <motion.div
                      key="locations-list"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-card"
                    >
                      <h3 className="font-playfair text-base font-semibold text-slate-800 dark:text-white mb-4">
                        {t('tripDetail.mapPanel.title')}
                      </h3>

                      {sortedLocations.length === 0 ? (
                        <p className="text-sm text-slate-400 italic">
                          {t('tripDetail.mapPanel.empty')}
                        </p>
                      ) : (
                        <>
                          {sortedLocations.length > 1 && (
                            <p className="text-xs text-slate-400 -mt-2 mb-3">{t('tripDetail.mapPanel.dragHint')}</p>
                          )}
                          <SortableLocationList
                            locations={sortedLocations}
                            onSelect={setSelectedLocation}
                            onReorder={reorderLocations}
                          />
                        </>
                      )}

                      <TracksPanel tripId={trip.id} tracks={trip.tracks ?? []} onChanged={refreshTrip} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              {/* Photos/videos without GPS: place them so they appear on the map */}
              <div className="lg:col-span-3 -mt-6">
                <UnlocatedMediaPanel
                  tripId={trip.id}
                  media={media}
                  locations={sortedLocations}
                  picking={!!pickingIds}
                  onPickOnMap={(ids) => {
                    setPickingIds(ids);
                    document.querySelector('.leaflet-container')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}
                  onCancelPick={() => setPickingIds(null)}
                  onChanged={refreshTrip}
                />
              </div>
            </motion.div>
          )}

          {/* ── EXPENSES TAB ── */}

          {activeTab === 'expenses' && (
            <motion.div
              key="expenses"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <ExpensesPanel trip={trip} />
            </motion.div>
          )}

          {/* ── TIMELINE TAB ── */}
          {activeTab === 'timeline' && (
            <motion.div
              key="timeline"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Timeline trip={trip} />
            </motion.div>
          )}

          {/* ── PHOTOS TAB ── */}
          {activeTab === 'photos' && (
            <motion.div
              key="photos"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {/* Upload button */}
              <div className="flex justify-end mb-5">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => openUploadModal()}
                  className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-sm transition-colors"
                >
                  <ImagePlus size={16} />
                  {t('tripDetail.uploadPhotos')}
                </motion.button>
              </div>
              <PhotoGallery
                trip={trip}
                onPhotoDeleted={() => qc.invalidateQueries({ queryKey: ['trip', id] })}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Edit modal */}
      <AddTripModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        initialTrip={trip}
        onSuccess={() => {
          setEditModalOpen(false);
          qc.invalidateQueries({ queryKey: ['trip', id] });
          qc.invalidateQueries({ queryKey: ['trips'] });
        }}
      />

      {/* Share link */}
      <AnimatePresence>
        {shareOpen && <ShareDialog trip={trip} onClose={() => setShareOpen(false)} onChanged={refreshTrip} />}
      </AnimatePresence>

      {/* Bulk import of photos/videos into this trip */}
      <ImportPhotosModal isOpen={importOpen} onClose={() => setImportOpen(false)} defaultTripId={trip.id} />

      {/* Photo/video opened from the map */}
      <AnimatePresence>
        {mapLightbox && (
          <Lightbox
            photos={mapLightbox.photos}
            startIndex={mapLightbox.index}
            onClose={() => setMapLightbox(null)}
            placeName={(p) => (p.location_id ? locationName.get(p.location_id) : undefined)}
          />
        )}
      </AnimatePresence>

      {/* Photo upload modal — opened from Photos tab or Location panel */}
      <PhotoUploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        tripId={trip.id}
        locations={sortedLocations}
        defaultLocationId={uploadDefaultLocationId}
        onUploaded={refreshTrip}
        onSuccess={() => {
          setUploadModalOpen(false);
          qc.invalidateQueries({ queryKey: ['trip', id] });
        }}
      />
    </>
  );
}
