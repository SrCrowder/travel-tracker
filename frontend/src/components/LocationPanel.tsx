import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, MapPin, Calendar, Star, StickyNote, ChevronLeft, ChevronRight,
  ImagePlus, ZoomIn, Pencil, Check, Trash2,
} from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { getImageUrl, locationsApi, photosApi } from '../api/client';
import Lightbox from './Lightbox';
import { useDateLocale } from '../i18n/useDateLocale';
import type { Location } from '../types';

interface LocationPanelProps {
  location: Location;
  tripId: number;
  onClose: () => void;
  onAddPhotos: () => void;
  onLocationUpdated: () => void;
}

export default function LocationPanel({
  location, tripId, onClose, onAddPhotos, onLocationUpdated,
}: LocationPanelProps) {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();

  const [photoIndex, setPhotoIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletedPhotoIds, setDeletedPhotoIds] = useState<Set<number>>(new Set());
  const [editForm, setEditForm] = useState({
    name: location.name,
    country: location.country ?? '',
    description: location.description ?? '',
    notes: location.notes ?? '',
    rating: location.rating ?? 0,
    date_start: location.date_start ?? '',
    date_end: location.date_end ?? '',
    lat: location.lat,
    lng: location.lng,
  });

  // Sync form + photoIndex when location prop refreshes after a save
  useEffect(() => {
    setEditForm({
      name: location.name,
      country: location.country ?? '',
      description: location.description ?? '',
      notes: location.notes ?? '',
      rating: location.rating ?? 0,
      date_start: location.date_start ?? '',
      date_end: location.date_end ?? '',
      lat: location.lat,
      lng: location.lng,
    });
    setPhotoIndex(0);
  }, [location]);

  // Photos filtered optimistically after local deletions
  const photos = (location.photos ?? []).filter((p) => !deletedPhotoIds.has(p.id));

  const prevPhoto = () => setPhotoIndex((i) => (i - 1 + photos.length) % photos.length);
  const nextPhoto = () => setPhotoIndex((i) => (i + 1) % photos.length);

  const handleDeletePhoto = async (photoId: number) => {
    const newPhotos = photos.filter((p) => p.id !== photoId);
    if (photoIndex >= newPhotos.length) setPhotoIndex(Math.max(0, newPhotos.length - 1));
    if (lightboxOpen && photos[photoIndex]?.id === photoId) setLightboxOpen(false);
    setDeletedPhotoIds((prev) => new Set([...prev, photoId]));
    try {
      await photosApi.delete(tripId, photoId);
      onLocationUpdated();
    } catch {
      setDeletedPhotoIds((prev) => {
        const next = new Set(prev);
        next.delete(photoId);
        return next;
      });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await locationsApi.update(tripId, location.id, {
        name: editForm.name,
        country: editForm.country,           // '' clears it  (backend: ?? existing)
        description: editForm.description,   // '' clears it  (backend: ?? existing)
        notes: editForm.notes,               // '' clears it  (backend: ?? existing)
        rating: editForm.rating,             // 0 → null      (backend: 0 ? num : null)
        date_start: editForm.date_start || undefined,
        date_end: editForm.date_end || undefined,
        lat: editForm.lat,
        lng: editForm.lng,
      });
      onLocationUpdated();
      setEditing(false);
    } catch {
      // silent — could add error banner
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ duration: 0.25 }}
      className="bg-white dark:bg-slate-800 rounded-2xl shadow-card overflow-hidden flex flex-col"
    >
      {/* Photo carousel */}
      {photos.length > 0 && (
        <div className="relative h-52 bg-slate-200 dark:bg-slate-700 overflow-hidden group">

          {/* Zoom overlay */}
          <div
            onClick={() => setLightboxOpen(true)}
            className="absolute inset-0 z-[1] cursor-zoom-in group/zoom"
          >
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center">
              <ZoomIn size={22} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
            </div>
          </div>

          {/* Delete current photo */}
          <button
            onClick={(e) => { e.stopPropagation(); if (window.confirm(t('photoGallery.deleteConfirm'))) handleDeletePhoto(photos[photoIndex].id); }}
            title={t('locationPanel.deletePhoto')}
            className="absolute top-2 right-2 z-[3] w-7 h-7 bg-red-500/70 hover:bg-red-600 backdrop-blur-sm rounded-full flex items-center justify-center text-white transition-all opacity-0 group-hover:opacity-100"
          >
            <Trash2 size={13} />
          </button>

          <AnimatePresence mode="wait">
            <motion.img
              key={photos[photoIndex].id}
              src={getImageUrl(photos[photoIndex].filename)}
              alt={photos[photoIndex].caption || location.name}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-full h-full object-cover"
            />
          </AnimatePresence>

          {photos.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); prevPhoto(); }}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-[2] w-8 h-8 bg-black/40 hover:bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center text-white transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); nextPhoto(); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-[2] w-8 h-8 bg-black/40 hover:bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center text-white transition-colors"
              >
                <ChevronRight size={16} />
              </button>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 z-[2]">
                {photos.map((_, i) => (
                  <button
                    key={i}
                    onClick={(e) => { e.stopPropagation(); setPhotoIndex(i); }}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${i === photoIndex ? 'bg-white scale-125' : 'bg-white/50'}`}
                  />
                ))}
              </div>
            </>
          )}

          {photos[photoIndex]?.caption && (
            <div className="absolute bottom-0 left-0 right-0 px-3 py-2 bg-gradient-to-t from-black/60 to-transparent z-[1]">
              <p className="text-white text-xs">{photos[photoIndex].caption}</p>
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between p-5 pb-3">
        <div>
          <div className="flex items-center gap-1.5 text-primary-500 mb-1">
            <MapPin size={14} />
            {location.country && (
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {location.country}
              </span>
            )}
          </div>
          <h3 className="font-playfair text-xl font-semibold text-slate-800 dark:text-white">
            {location.name}
          </h3>
          {location.rating != null && location.rating > 0 && (
            <div className="flex gap-0.5 mt-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  size={14}
                  className={i < (location.rating ?? 0) ? 'fill-amber-400 text-amber-400' : 'text-slate-200 dark:text-slate-600'}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setEditing((e) => !e)}
            title={editing ? t('locationPanel.cancelEditTitle') : t('locationPanel.editTitle')}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
              editing
                ? 'text-primary-600 bg-primary-50 dark:bg-primary-900/40'
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 pb-5 space-y-4 overflow-y-auto flex-1">
        {editing ? (
          /* ── Edit form ── */
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t('locationPanel.form.name')}</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t('locationPanel.form.country')}</label>
                <input
                  type="text"
                  value={editForm.country}
                  onChange={(e) => setEditForm((p) => ({ ...p, country: e.target.value }))}
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t('locationPanel.form.lat')}</label>
                <input
                  type="number"
                  step="any"
                  value={editForm.lat}
                  onChange={(e) => setEditForm((p) => ({ ...p, lat: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t('locationPanel.form.lng')}</label>
                <input
                  type="number"
                  step="any"
                  value={editForm.lng}
                  onChange={(e) => setEditForm((p) => ({ ...p, lng: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t('locationPanel.form.dateStart')}</label>
                <input
                  type="date"
                  value={editForm.date_start}
                  onChange={(e) => setEditForm((p) => ({ ...p, date_start: e.target.value }))}
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t('locationPanel.form.dateEnd')}</label>
                <input
                  type="date"
                  value={editForm.date_end}
                  onChange={(e) => setEditForm((p) => ({ ...p, date_end: e.target.value }))}
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t('locationPanel.form.description')}</label>
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                rows={2}
                placeholder={t('locationPanel.form.descriptionPlaceholder')}
                className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t('locationPanel.form.notes')}</label>
              <textarea
                value={editForm.notes}
                onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))}
                rows={2}
                placeholder={t('locationPanel.form.notesPlaceholder')}
                className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                {t('locationPanel.form.rating')}
                {editForm.rating > 0 && (
                  <button
                    type="button"
                    onClick={() => setEditForm((p) => ({ ...p, rating: 0 }))}
                    className="ml-2 text-slate-400 hover:text-red-400 transition-colors normal-case font-normal"
                  >
                    {t('locationPanel.form.clearRating')}
                  </button>
                )}
              </label>
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() =>
                      setEditForm((p) => ({ ...p, rating: i + 1 === p.rating ? 0 : i + 1 }))
                    }
                    className="p-0.5 hover:scale-110 transition-transform"
                  >
                    <Star
                      size={20}
                      className={
                        i < editForm.rating
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-slate-300 dark:text-slate-600'
                      }
                    />
                  </button>
                ))}
                {editForm.rating > 0 && (
                  <span className="text-xs text-slate-400 ml-1">{editForm.rating}/5</span>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setEditing(false)}
                className="flex-1 py-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-600 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !editForm.name}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-xl transition-colors"
              >
                <Check size={14} />
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        ) : (
          /* ── View mode ── */
          <>
            {(location.date_start || location.date_end) && (
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <Calendar size={14} className="shrink-0 text-primary-400" />
                <span>
                  {location.date_start && format(new Date(location.date_start), 'MMM d', { locale: dateLocale })}
                  {location.date_start && location.date_end && ' – '}
                  {location.date_end && format(new Date(location.date_end), 'MMM d, yyyy', { locale: dateLocale })}
                </span>
              </div>
            )}

            {location.description && (
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {location.description}
              </p>
            )}

            {location.notes && (
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <StickyNote size={13} className="text-amber-500" />
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">{t('locationPanel.notes')}</span>
                </div>
                <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">{location.notes}</p>
              </div>
            )}

            <button
              onClick={onAddPhotos}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-600 text-sm text-slate-500 dark:text-slate-400 hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all"
            >
              <ImagePlus size={15} />
              {photos.length === 0
                ? t('locationPanel.addPhotos')
                : t('locationPanel.addMorePhotos', { count: photos.length })}
            </button>
          </>
        )}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxOpen && photos.length > 0 && (
          <Lightbox
            photos={photos}
            startIndex={Math.min(photoIndex, photos.length - 1)}
            onClose={() => setLightboxOpen(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
