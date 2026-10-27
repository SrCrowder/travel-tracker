import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronLeft, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { tripsApi, getImageUrl } from '../api/client';
import TripInfoStep from './addTrip/TripInfoStep';
import LocationsStep from './addTrip/LocationsStep';
import { EMPTY_TRIP_FORM, type LocationDraft, type TripFormValues } from './addTrip/types';
import type { Trip, Location } from '../types';

interface AddTripModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** When provided the modal operates in edit mode */
  initialTrip?: Trip;
}

function formFromTrip(trip: Trip): TripFormValues {
  return {
    title: trip.title,
    description: trip.description ?? '',
    startDate: trip.start_date,
    endDate: trip.end_date,
    tags: [...trip.tags],
    coverFile: null,
    coverPreview: trip.cover_image ? getImageUrl(trip.cover_image) : '',
    coverPosX: trip.cover_position_x ?? 50,
    coverPosY: trip.cover_position_y ?? 50,
  };
}

export default function AddTripModal({ isOpen, onClose, onSuccess, initialTrip }: AddTripModalProps) {
  const isEditing = !!initialTrip;
  const { t } = useTranslation();

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<TripFormValues>(EMPTY_TRIP_FORM);
  // Locations already saved (edit mode only) — user can remove them
  const [existingLocations, setExistingLocations] = useState<Location[]>([]);
  const [removedLocationIds, setRemovedLocationIds] = useState<number[]>([]);
  // New locations added during this session (both modes)
  const [newLocations, setNewLocations] = useState<LocationDraft[]>([]);

  const resetForm = () => {
    setStep(1);
    setForm(initialTrip ? formFromTrip(initialTrip) : EMPTY_TRIP_FORM);
    setExistingLocations(initialTrip ? [...initialTrip.locations].sort((a, b) => a.order_index - b.order_index) : []);
    setRemovedLocationIds([]);
    setNewLocations([]);
    setError('');
  };

  // ── Populate state when modal opens ───────────────────────────────────────
  useEffect(() => {
    if (isOpen) resetForm();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const updateForm = useCallback((patch: Partial<TripFormValues>) => setForm((f) => ({ ...f, ...patch })), []);

  // ── Submit: trip + location changes go in one request (one transaction) ──
  const handleSubmit = async () => {
    if (!form.title || !form.startDate || !form.endDate) {
      setError(t('addTrip.errors.fillTitleDates'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('title', form.title);
      formData.append('description', form.description);
      formData.append('start_date', form.startDate);
      formData.append('end_date', form.endDate);
      formData.append('tags', JSON.stringify(form.tags));
      formData.append('cover_position_x', form.coverPosX.toString());
      formData.append('cover_position_y', form.coverPosY.toString());
      formData.append('new_locations', JSON.stringify(newLocations));
      if (form.coverFile) formData.append('cover_image', form.coverFile);

      if (initialTrip) {
        formData.append('removed_location_ids', JSON.stringify(removedLocationIds));
        if (!form.coverFile && !form.coverPreview && initialTrip.cover_image) {
          formData.append('remove_cover', 'true');
        }
        await tripsApi.update(initialTrip.id, formData);
      } else {
        await tripsApi.create(formData);
      }

      onSuccess();
      resetForm();
    } catch {
      setError(t('addTrip.errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => { resetForm(); onClose(); };

  const goToStep2 = () => {
    if (!form.title || !form.startDate || !form.endDate) { setError(t('addTrip.errors.fillTitleDates')); return; }
    setError('');
    setStep(2);
  };

  if (!isOpen) return null;

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
              {step === 1 && <TripInfoStep values={form} onChange={updateForm} />}
              {step === 2 && (
                <LocationsStep
                  existingLocations={existingLocations}
                  newLocations={newLocations}
                  onRemoveExisting={(id) => {
                    setExistingLocations((prev) => prev.filter((l) => l.id !== id));
                    setRemovedLocationIds((prev) => [...prev, id]);
                  }}
                  onAddNew={(draft) => setNewLocations((prev) => [...prev, draft])}
                  onRemoveNew={(i) => setNewLocations((prev) => prev.filter((_, idx) => idx !== i))}
                  onError={setError}
                />
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
