import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Calendar, MapPin, Clock, Tag, Trash2, MoreVertical, Pencil, ImagePlus, FileDown, Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { tripsApi, locationsApi, getImageUrl } from '../api/client';
import Navbar from '../components/Navbar';
import InteractiveMap from '../components/InteractiveMap';
import LocationPanel from '../components/LocationPanel';
import PhotoGallery from '../components/PhotoGallery';
import Timeline from '../components/Timeline';
import LoadingSpinner from '../components/LoadingSpinner';
import AddTripModal from '../components/AddTripModal';
import PhotoUploadModal from '../components/PhotoUploadModal';
import { useDateLocale } from '../i18n/useDateLocale';
import { useTripPdfExport } from '../hooks/useTripPdfExport';
import type { Trip, Location } from '../types';

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

type TabId = 'map' | 'timeline' | 'photos';
const TAB_IDS: TabId[] = ['map', 'timeline', 'photos'];

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
  });

  // When trip data refreshes after a location edit, keep selectedLocation in sync
  useEffect(() => {
    if (selectedLocation && trip?.locations) {
      const refreshed = trip.locations.find((l) => l.id === selectedLocation.id);
      if (refreshed) setSelectedLocation(refreshed);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip]);

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

  const durationDays =
    Math.ceil(
      (new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) /
        (1000 * 60 * 60 * 24)
    ) + 1;

  const sortedLocations = [...(trip.locations ?? [])].sort(
    (a, b) => a.order_index - b.order_index
  );

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
                className="absolute right-0 mt-2 w-44 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden z-10"
              >
                <button
                  onClick={() => { setMenuOpen(false); setEditModalOpen(true); }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <Pencil size={15} />
                  {t('tripDetail.editTrip')}
                </button>
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
          {/* Tags */}
          {trip.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
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
              {format(new Date(trip.start_date), 'MMM d', { locale: dateLocale })}
              {' – '}
              {format(new Date(trip.end_date), 'MMM d, yyyy', { locale: dateLocale })}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock size={14} />
              {t('tripDetail.days', { count: durationDays })}
            </span>
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

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white dark:bg-slate-800 p-1 rounded-xl w-fit shadow-card">
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
              {tabId === 'photos' && (() => {
                const count = (trip.photos?.length ?? 0) +
                  (trip.locations?.reduce((s, l) => s + (l.photos?.length ?? 0), 0) ?? 0);
                return count > 0 ? (
                  <span className="relative z-10 ml-1.5 text-xs opacity-70">({count})</span>
                ) : null;
              })()}
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
                        <ol className="space-y-2">
                          {sortedLocations.map((loc, i) => (
                            <motion.li key={loc.id} whileHover={{ x: 2 }}>
                              <button
                                onClick={() => setSelectedLocation(loc)}
                                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all text-left group"
                              >
                                <span className="w-7 h-7 flex items-center justify-center bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 rounded-full text-xs font-bold shrink-0">
                                  {i + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-slate-800 dark:text-white text-sm truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                                    {loc.name}
                                  </p>
                                  {loc.country && (
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                      {loc.country}
                                    </p>
                                  )}
                                </div>
                                {loc.photos && loc.photos.length > 0 && (
                                  <span className="text-xs text-slate-400 shrink-0">
                                    📷 {loc.photos.length}
                                  </span>
                                )}
                              </button>
                            </motion.li>
                          ))}
                        </ol>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
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

      {/* Photo upload modal — opened from Photos tab or Location panel */}
      <PhotoUploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        tripId={trip.id}
        locations={sortedLocations}
        defaultLocationId={uploadDefaultLocationId}
        onSuccess={() => {
          setUploadModalOpen(false);
          qc.invalidateQueries({ queryKey: ['trip', id] });
        }}
      />
    </>
  );
}
