import { useState, useMemo, lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import { tripsApi } from '../api/client';
import TripCard from '../components/TripCard';
import TripCalendar from '../components/TripCalendar';
import StatsSection from '../components/StatsSection';
import FilterBar from '../components/FilterBar';
import AddTripModal from '../components/AddTripModal';
import ImportPhotosModal from '../components/ImportPhotosModal';
import EmptyState from '../components/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner';
import Navbar from '../components/Navbar';
import { useStore } from '../store/useStore';
import { tripYear } from '../lib/tripDates';
import type { Trip, TripDate, TripStatus } from '../types';

// Leaflet + country outlines: loaded with the dashboard, not the first paint
const WorldMap = lazy(() => import('../components/WorldMap'));

type StatusFilter = 'all' | TripStatus;
const STATUS_FILTERS: StatusFilter[] = ['all', 'done', 'planned', 'wishlist'];

export default function Dashboard() {
  const { searchQuery, selectedYear, selectedTags } = useStore();
  const { t } = useTranslation();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const { data: trips = [], isLoading, refetch } = useQuery({
    queryKey: ['trips'],
    queryFn: async () => {
      const res = await tripsApi.getAll();
      return res.data as Trip[];
    },
  });

  // Build date map for calendar
  const tripDates = useMemo<TripDate[]>(() => {
    return trips.flatMap((trip) => {
      const dates: TripDate[] = [];
      if (!trip.start_date || !trip.end_date) return dates;
      const start = parseISO(trip.start_date);
      const end = parseISO(trip.end_date);
      const current = new Date(start);
      while (current <= end) {
        dates.push({ date: new Date(current), tripId: trip.id, tripTitle: trip.title });
        current.setDate(current.getDate() + 1);
      }
      return dates;
    });
  }, [trips]);

  // Filter logic
  const filteredTrips = useMemo(() => {
    return trips.filter((trip) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        trip.title.toLowerCase().includes(q) ||
        trip.description.toLowerCase().includes(q) ||
        trip.locations?.some(
          (l) => l.name.toLowerCase().includes(q) || l.country.toLowerCase().includes(q)
        );
      const matchesYear = !selectedYear || tripYear(trip) === selectedYear;
      const matchesTags = selectedTags.length === 0 || selectedTags.some((tag) => trip.tags.includes(tag));
      const matchesStatus = statusFilter === 'all' || trip.status === statusFilter;
      return matchesSearch && matchesYear && matchesTags && matchesStatus;
    });
  }, [trips, searchQuery, selectedYear, selectedTags, statusFilter]);

  const isFiltered = !!searchQuery || selectedYear !== null || selectedTags.length > 0 || statusFilter !== 'all';
  // Stats count only the trips that actually happened
  const doneTrips = useMemo(() => trips.filter((trip) => trip.status === 'done'), [trips]);
  const statusCount = (s: StatusFilter) => (s === 'all' ? trips.length : trips.filter((trip) => trip.status === s).length);

  if (isLoading) return (
    <>
      <Navbar onAddTrip={() => setIsAddModalOpen(true)} onImport={() => setIsImportOpen(true)} />
      <LoadingSpinner message={t('dashboard.loading')} />
    </>
  );

  return (
    <>
      <Navbar onAddTrip={() => setIsAddModalOpen(true)} onImport={() => setIsImportOpen(true)} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Hero header */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="font-playfair text-4xl md:text-5xl font-bold text-slate-800 dark:text-white">
            {t('dashboard.heading')}
          </h1>
          <p className="mt-2 text-slate-500 dark:text-slate-400 text-lg">
            {trips.length === 0
              ? t('dashboard.subtitleEmpty')
              : t('dashboard.subtitleCount', { count: trips.length, year: format(new Date(), 'yyyy') })}
          </p>
        </motion.div>

        {doneTrips.length > 0 && <StatsSection trips={doneTrips} />}

        {trips.length > 0 && (
          <Suspense fallback={<div className="h-80 mb-8 rounded-2xl bg-white dark:bg-slate-800 shadow-card animate-pulse" />}>
            <WorldMap trips={trips} />
          </Suspense>
        )}

        {/* Done / planned / wishlist */}
        {trips.some((trip) => trip.status !== 'done') && (
          <div className="flex flex-wrap gap-2 mb-4">
            {STATUS_FILTERS.map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  statusFilter === s
                    ? 'bg-slate-800 text-white dark:bg-white dark:text-slate-900'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 shadow-sm'
                }`}>
                {t(`tripStatus.filter.${s}`)} <span className="opacity-60 ml-0.5">{statusCount(s)}</span>
              </button>
            ))}
          </div>
        )}

        <div className="mb-6">
          <FilterBar trips={trips} onAddTrip={() => setIsAddModalOpen(true)} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          <div className="lg:col-span-2 xl:col-span-3">
            <AnimatePresence mode="popLayout">
              {filteredTrips.length === 0 ? (
                <EmptyState key="empty" onAddTrip={() => setIsAddModalOpen(true)} isFiltered={isFiltered} />
              ) : (
                <motion.div key="grid" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                  {filteredTrips.map((trip, i) => (
                    <motion.div
                      key={trip.id}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ delay: i * 0.04 }}
                    >
                      <TripCard trip={trip} />
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-5">
              <TripCalendar tripDates={tripDates} trips={trips} />
            </div>
          </div>
        </div>
      </div>

      <ImportPhotosModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} />

      <AddTripModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={() => { setIsAddModalOpen(false); refetch(); }}
      />
    </>
  );
}
