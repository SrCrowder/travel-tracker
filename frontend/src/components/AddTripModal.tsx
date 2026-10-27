import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import {
  X, Plus, Trash2, MapPin, Upload, ChevronRight, ChevronLeft,
  Search, Loader2, Star,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { tripsApi, locationsApi, geocode, getImageUrl } from '../api/client';
import CoverPositionPicker from './CoverPositionPicker';
import type { Trip, Location, GeocodingResult } from '../types';

const AVAILABLE_TAGS = ['adventure', 'food', 'hiking', 'culture', 'beach', 'city', 'nature'];

interface LocationDraft {
  name: string;
  country: string;
  lat: number;
  lng: number;
  date_start: string;
  date_end: string;
  description: string;
  notes: string;
  rating: number;
}

interface AddTripModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** When provided the modal operates in edit mode */
  initialTrip?: Trip;
}

export default function AddTripModal({ isOpen, onClose, onSuccess, initialTrip }: AddTripModalProps) {
  const isEditing = !!initialTrip;
  const { t } = useTranslation();

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ── Step 1 fields ──────────────────────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState('');
  const [coverPosX, setCoverPosX] = useState(50);
  const [coverPosY, setCoverPosY] = useState(50);

  // ── Step 2 fields ──────────────────────────────────────────────────────────
  // Locations already saved (edit mode only) — user can remove them
  const [existingLocations, setExistingLocations] = useState<Location[]>([]);
  const [removedLocationIds, setRemovedLocationIds] = useState<number[]>([]);
  // New locations added during this session (both modes)
  const [newLocations, setNewLocations] = useState<LocationDraft[]>([]);

  // Geocoding / new-location form
  const [locationSearch, setLocationSearch] = useState('');
  const [geocodeResults, setGeocodeResults] = useState<GeocodingResult[]>([]);
  const [geocoding, setGeocoding] = useState(false);
  const [newLocation, setNewLocation] = useState<Partial<LocationDraft>>({
    name: '', country: '', lat: 0, lng: 0,
    date_start: '', date_end: '', description: '', notes: '', rating: 0,
  });

  // ── Populate state when modal opens ───────────────────────────────────────
  useEffect(() => {
    if (isOpen && initialTrip) {
      setTitle(initialTrip.title);
      setDescription(initialTrip.description ?? '');
      setStartDate(initialTrip.start_date);
      setEndDate(initialTrip.end_date);
      setSelectedTags([...initialTrip.tags]);
      setCoverPreview(initialTrip.cover_image ? getImageUrl(initialTrip.cover_image) : '');
      setCoverFile(null);
      setCoverPosX(initialTrip.cover_position_x ?? 50);
      setCoverPosY(initialTrip.cover_position_y ?? 50);
      setExistingLocations([...(initialTrip.locations ?? [])].sort((a, b) => a.order_index - b.order_index));
      setRemovedLocationIds([]);
      setNewLocations([]);
      setStep(1);
      setError('');
    } else if (isOpen && !initialTrip) {
      // Create mode — ensure form is blank
      resetForm();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ── Cover image dropzone ───────────────────────────────────────────────────
  const onDrop = useCallback((accepted: File[]) => {
    const file = accepted[0];
    if (!file) return;
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
    // Reset position when a new image is dropped
    setCoverPosX(50);
    setCoverPosY(50);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  const toggleTag = (tag: string) =>
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );

  const handleGeocode = async () => {
    if (!locationSearch.trim()) return;
    setGeocoding(true);
    setGeocodeResults([]);
    try {
      const results = await geocode(locationSearch);
      setGeocodeResults(results);
    } catch {
      setError(t('addTrip.errors.geocodingFailed'));
    } finally {
      setGeocoding(false);
    }
  };

  const selectGeoResult = (result: GeocodingResult) => {
    const country = result.address?.country ?? locationSearch.split(',').pop()?.trim() ?? '';
    setNewLocation((prev) => ({
      ...prev,
      name: result.display_name.split(',')[0].trim(),
      country,
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
    }));
    setGeocodeResults([]);
    setLocationSearch('');
  };

  const addNewLocation = () => {
    if (!newLocation.name || !newLocation.lat || !newLocation.lng) return;
    setNewLocations((prev) => [...prev, newLocation as LocationDraft]);
    setNewLocation({ name: '', country: '', lat: 0, lng: 0, date_start: '', date_end: '', description: '', notes: '', rating: 0 });
    setLocationSearch('');
  };

  const removeExistingLocation = (id: number) => {
    setExistingLocations((prev) => prev.filter((l) => l.id !== id));
    setRemovedLocationIds((prev) => [...prev, id]);
  };

  const removeNewLocation = (i: number) =>
    setNewLocations((prev) => prev.filter((_, idx) => idx !== i));

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!title || !startDate || !endDate) {
      setError(t('addTrip.errors.fillTitleDates'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('title', title);
      formData.append('description', description);
      formData.append('start_date', startDate);
      formData.append('end_date', endDate);
      formData.append('tags', JSON.stringify(selectedTags));
      formData.append('cover_position_x', coverPosX.toString());
      formData.append('cover_position_y', coverPosY.toString());
      if (coverFile) formData.append('cover_image', coverFile);

      if (isEditing && initialTrip) {
        // ── Edit mode ──────────────────────────────────────────────────────
        if (!coverFile && !coverPreview && initialTrip.cover_image) {
          formData.append('remove_cover', 'true');
        }
        await tripsApi.update(initialTrip.id, formData);

        // Delete removed locations
        for (const locId of removedLocationIds) {
          await locationsApi.delete(initialTrip.id, locId);
        }

        // Add new locations with order_index continuing from remaining existing ones
        const baseOrder = existingLocations.length;
        for (let i = 0; i < newLocations.length; i++) {
          await locationsApi.create(initialTrip.id, {
            ...newLocations[i],
            order_index: baseOrder + i,
          } as any);
        }
      } else {
        // ── Create mode ────────────────────────────────────────────────────
        const { data: trip } = await tripsApi.create(formData);
        for (let i = 0; i < newLocations.length; i++) {
          await locationsApi.create(trip.id, { ...newLocations[i], order_index: i } as any);
        }
      }

      onSuccess();
      resetForm();
    } catch {
      setError(t('addTrip.errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setStep(1);
    setTitle(''); setDescription('');
    setStartDate(''); setEndDate('');
    setSelectedTags([]); setCoverFile(null); setCoverPreview('');
    setCoverPosX(50); setCoverPosY(50);
    setExistingLocations([]); setRemovedLocationIds([]); setNewLocations([]);
    setNewLocation({});
    setError('');
  };

  const handleClose = () => { resetForm(); onClose(); };

  const goToStep2 = () => {
    if (!title || !startDate || !endDate) { setError(t('addTrip.errors.fillTitleDates')); return; }
    setError('');
    setStep(2);
  };

  if (!isOpen) return null;

  const totalLocations = existingLocations.length + newLocations.length;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ type: 'spring', duration: 0.35 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-xl bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700">
            <div>
              <h2 className="font-playfair text-xl font-bold text-slate-800 dark:text-white">
                {isEditing
                  ? t('addTrip.titleEdit')
                  : step === 1 ? t('addTrip.titleCreate') : t('addTrip.titleLocations')}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">{t('addTrip.step', { step })}</p>
            </div>
            <button onClick={handleClose} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* Progress bar */}
          <div className="h-1 bg-slate-200 dark:bg-slate-700">
            <div className="h-full bg-primary-500 transition-all duration-300" style={{ width: `${step * 50}%` }} />
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6">
            <AnimatePresence mode="wait">

              {/* ── STEP 1: Trip info ─────────────────────────────────── */}
              {step === 1 && (
                <motion.div key="step1" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="space-y-5">

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t('addTrip.fields.tripTitle')}</label>
                    <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                      placeholder={t('addTrip.fields.tripTitlePlaceholder')}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-400 transition-all" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t('addTrip.fields.startDate')}</label>
                      <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-400 transition-all" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t('addTrip.fields.endDate')}</label>
                      <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-400 transition-all" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t('addTrip.fields.description')}</label>
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                      placeholder={t('addTrip.fields.descriptionPlaceholder')} rows={3}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none transition-all" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('addTrip.fields.tags')}</label>
                    <div className="flex flex-wrap gap-2">
                      {AVAILABLE_TAGS.map((tag) => (
                        <button key={tag} onClick={() => toggleTag(tag)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-all ${
                            selectedTags.includes(tag) ? 'bg-primary-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                          }`}>
                          {t(`tags.${tag}`)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('addTrip.fields.coverImage')}</label>
                    {coverPreview ? (
                      <CoverPositionPicker
                        imageUrl={coverPreview}
                        x={coverPosX}
                        y={coverPosY}
                        onChange={(x, y) => { setCoverPosX(x); setCoverPosY(y); }}
                        onRemove={() => { setCoverFile(null); setCoverPreview(''); setCoverPosX(50); setCoverPosY(50); }}
                      />
                    ) : (
                      <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                        isDragActive ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20' : 'border-slate-200 dark:border-slate-600 hover:border-primary-300'
                      }`}>
                        <input {...getInputProps()} />
                        <Upload size={20} className="mx-auto mb-2 text-slate-400" />
                        <p className="text-sm text-slate-500">{t('addTrip.fields.coverDrop')}</p>
                        <p className="text-xs text-slate-400 mt-1">{t('addTrip.fields.coverFormats')}</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* ── STEP 2: Locations ─────────────────────────────────── */}
              {step === 2 && (
                <motion.div key="step2" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} className="space-y-5">

                  {/* Current route */}
                  {totalLocations > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        {t('addTrip.locations.routeLabel', { count: totalLocations })}
                      </p>

                      {/* Existing saved locations */}
                      {existingLocations.map((loc, i) => (
                        <div key={loc.id} className="flex items-center gap-3 bg-slate-50 dark:bg-slate-700 rounded-xl px-4 py-2.5">
                          <span className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-300 text-xs flex items-center justify-center font-bold shrink-0">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 dark:text-white truncate">{loc.name}</p>
                            {loc.country && <p className="text-xs text-slate-500">{loc.country}</p>}
                          </div>
                          <button onClick={() => removeExistingLocation(loc.id)}
                            className="text-slate-400 hover:text-red-500 transition-colors shrink-0">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}

                      {/* New (unsaved) locations */}
                      {newLocations.map((loc, i) => (
                        <div key={`new-${i}`} className="flex items-center gap-3 bg-primary-50 dark:bg-primary-900/20 rounded-xl px-4 py-2.5 border border-primary-200 dark:border-primary-800">
                          <span className="w-6 h-6 rounded-full bg-primary-200 dark:bg-primary-800 text-primary-700 dark:text-primary-200 text-xs flex items-center justify-center font-bold shrink-0">{existingLocations.length + i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 dark:text-white truncate">{loc.name}</p>
                            {loc.country && <p className="text-xs text-slate-500">{loc.country}</p>}
                          </div>
                          <span className="text-xs text-primary-500 font-medium shrink-0 mr-1">{t('common.new')}</span>
                          <button onClick={() => removeNewLocation(i)}
                            className="text-slate-400 hover:text-red-500 transition-colors shrink-0">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Geocode search */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t('addTrip.locations.searchLabel')}</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input type="text" value={locationSearch} onChange={(e) => setLocationSearch(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleGeocode()}
                          placeholder={t('addTrip.locations.searchPlaceholder')}
                          className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-400 text-sm" />
                      </div>
                      <button onClick={handleGeocode} disabled={geocoding}
                        className="px-4 py-2 rounded-xl bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-300 text-sm font-medium hover:bg-primary-200 transition-colors disabled:opacity-50">
                        {geocoding ? <Loader2 size={16} className="animate-spin" /> : t('addTrip.locations.searchButton')}
                      </button>
                    </div>

                    <AnimatePresence>
                      {geocodeResults.length > 0 && (
                        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                          className="mt-1 bg-white dark:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-600 shadow-lg overflow-hidden">
                          {geocodeResults.map((result) => (
                            <button key={result.place_id} onClick={() => selectGeoResult(result)}
                              className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors border-b border-slate-100 dark:border-slate-600 last:border-0">
                              <MapPin size={12} className="inline mr-1.5 text-primary-500" />
                              {result.display_name}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* New location form */}
                  <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{t('addTrip.locations.name')}</label>
                        <input type="text" value={newLocation.name ?? ''} onChange={(e) => setNewLocation((p) => ({ ...p, name: e.target.value }))}
                          placeholder={t('addTrip.locations.namePlaceholder')}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{t('addTrip.locations.country')}</label>
                        <input type="text" value={newLocation.country ?? ''} onChange={(e) => setNewLocation((p) => ({ ...p, country: e.target.value }))}
                          placeholder={t('addTrip.locations.countryPlaceholder')}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-400" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{t('addTrip.locations.lat')}</label>
                        <input type="number" step="any" value={newLocation.lat || ''} onChange={(e) => setNewLocation((p) => ({ ...p, lat: parseFloat(e.target.value) }))}
                          placeholder="35.6762"
                          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{t('addTrip.locations.lng')}</label>
                        <input type="number" step="any" value={newLocation.lng || ''} onChange={(e) => setNewLocation((p) => ({ ...p, lng: parseFloat(e.target.value) }))}
                          placeholder="139.6503"
                          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-400" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{t('addTrip.locations.dateStart')}</label>
                        <input type="date" value={newLocation.date_start ?? ''} onChange={(e) => setNewLocation((p) => ({ ...p, date_start: e.target.value }))}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{t('addTrip.locations.dateEnd')}</label>
                        <input type="date" value={newLocation.date_end ?? ''} onChange={(e) => setNewLocation((p) => ({ ...p, date_end: e.target.value }))}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-400" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{t('addTrip.locations.description')}</label>
                      <textarea value={newLocation.description ?? ''} onChange={(e) => setNewLocation((p) => ({ ...p, description: e.target.value }))}
                        placeholder={t('addTrip.locations.descriptionPlaceholder')} rows={2}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none" />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{t('addTrip.locations.notes')}</label>
                      <textarea value={newLocation.notes ?? ''} onChange={(e) => setNewLocation((p) => ({ ...p, notes: e.target.value }))}
                        placeholder={t('addTrip.locations.notesPlaceholder')} rows={2}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none" />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">{t('addTrip.locations.rating')}</label>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <button key={i} type="button"
                            onClick={() => setNewLocation((p) => ({ ...p, rating: i + 1 === p.rating ? 0 : i + 1 }))}
                            className="p-0.5 hover:scale-110 transition-transform">
                            <Star size={18}
                              className={(newLocation.rating ?? 0) > i ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-600'} />
                          </button>
                        ))}
                        {(newLocation.rating ?? 0) > 0 && (
                          <span className="text-xs text-slate-400 ml-1">{newLocation.rating}/5</span>
                        )}
                      </div>
                    </div>

                    <button onClick={addNewLocation} disabled={!newLocation.name || !newLocation.lat}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors">
                      <Plus size={16} />
                      {t('addTrip.locations.addToRoute')}
                    </button>
                  </div>

                  <p className="text-xs text-slate-400 text-center">
                    {t('addTrip.locations.manageLater')}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error message */}
            {error && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="mt-4 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl px-4 py-2.5">
                {error}
              </motion.p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
            {step === 2 ? (
              <button onClick={() => setStep(1)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                <ChevronLeft size={16} /> {t('common.back')}
              </button>
            ) : (
              <button onClick={handleClose} className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                {t('common.cancel')}
              </button>
            )}

            <div className="flex gap-3">
              {step === 1 && (
                <button onClick={goToStep2}
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-xl transition-colors">
                  {t('common.next')} <ChevronRight size={16} />
                </button>
              )}
              {step === 2 && (
                <button onClick={handleSubmit} disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition-colors">
                  {saving
                    ? <><Loader2 size={16} className="animate-spin" /> {t('common.saving')}</>
                    : isEditing ? t('addTrip.saveChanges') : t('addTrip.saveTrip')}
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
