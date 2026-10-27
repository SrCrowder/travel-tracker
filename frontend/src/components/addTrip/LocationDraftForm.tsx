import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, MapPin, Search, Loader2, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { geocode } from '../../api/client';
import type { GeocodingResult } from '../../types';
import {
  EMPTY_LOCATION_DRAFT, labelClass, smallInputClass, smallLabelClass, type LocationDraft,
} from './types';

interface LocationDraftFormProps {
  onAdd: (draft: LocationDraft) => void;
  onError: (message: string) => void;
}

/** Geocoding search plus the fields of a new location. */
export default function LocationDraftForm({ onAdd, onError }: LocationDraftFormProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<LocationDraft>(EMPTY_LOCATION_DRAFT);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [searching, setSearching] = useState(false);

  const update = (patch: Partial<LocationDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const handleGeocode = async () => {
    if (!search.trim()) return;
    setSearching(true);
    setResults([]);
    try {
      setResults(await geocode(search));
    } catch {
      onError(t('addTrip.errors.geocodingFailed'));
    } finally {
      setSearching(false);
    }
  };

  const selectResult = (result: GeocodingResult) => {
    update({
      name: result.display_name.split(',')[0].trim(),
      country: result.address?.country ?? search.split(',').pop()?.trim() ?? '',
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
    });
    setResults([]);
    setSearch('');
  };

  const canAdd = !!draft.name && Number.isFinite(draft.lat) && Number.isFinite(draft.lng) && !(draft.lat === 0 && draft.lng === 0);

  const handleAdd = () => {
    if (!canAdd) return;
    onAdd(draft);
    setDraft(EMPTY_LOCATION_DRAFT);
    setSearch('');
  };

  // 0 / NaN show as an empty field (same as before: 0,0 means "not set")
  const numberValue = (n: number) => (Number.isFinite(n) && n !== 0 ? n : '');

  return (
    <>
      {/* Geocode search */}
      <div>
        <label className={labelClass}>{t('addTrip.locations.searchLabel')}</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGeocode()}
              placeholder={t('addTrip.locations.searchPlaceholder')}
              className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-400 text-sm" />
          </div>
          <button type="button" onClick={handleGeocode} disabled={searching}
            className="px-4 py-2 rounded-xl bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-300 text-sm font-medium hover:bg-primary-200 transition-colors disabled:opacity-50">
            {searching ? <Loader2 size={16} className="animate-spin" /> : t('addTrip.locations.searchButton')}
          </button>
        </div>

        <AnimatePresence>
          {results.length > 0 && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="mt-1 bg-white dark:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-600 shadow-lg overflow-hidden">
              {results.map((result) => (
                <button key={result.place_id} type="button" onClick={() => selectResult(result)}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors border-b border-slate-100 dark:border-slate-600 last:border-0">
                  <MapPin size={12} className="inline mr-1.5 text-primary-500" />
                  {result.display_name}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* New location fields */}
      <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={smallLabelClass}>{t('addTrip.locations.name')}</label>
            <input type="text" value={draft.name} onChange={(e) => update({ name: e.target.value })}
              placeholder={t('addTrip.locations.namePlaceholder')} className={smallInputClass} />
          </div>
          <div>
            <label className={smallLabelClass}>{t('addTrip.locations.country')}</label>
            <input type="text" value={draft.country} onChange={(e) => update({ country: e.target.value })}
              placeholder={t('addTrip.locations.countryPlaceholder')} className={smallInputClass} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={smallLabelClass}>{t('addTrip.locations.lat')}</label>
            <input type="number" step="any" min={-90} max={90} value={numberValue(draft.lat)}
              onChange={(e) => update({ lat: parseFloat(e.target.value) })} placeholder="35.6762" className={smallInputClass} />
          </div>
          <div>
            <label className={smallLabelClass}>{t('addTrip.locations.lng')}</label>
            <input type="number" step="any" min={-180} max={180} value={numberValue(draft.lng)}
              onChange={(e) => update({ lng: parseFloat(e.target.value) })} placeholder="139.6503" className={smallInputClass} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={smallLabelClass}>{t('addTrip.locations.dateStart')}</label>
            <input type="date" value={draft.date_start} onChange={(e) => update({ date_start: e.target.value })} className={smallInputClass} />
          </div>
          <div>
            <label className={smallLabelClass}>{t('addTrip.locations.dateEnd')}</label>
            <input type="date" value={draft.date_end} min={draft.date_start || undefined}
              onChange={(e) => update({ date_end: e.target.value })} className={smallInputClass} />
          </div>
        </div>

        <div>
          <label className={smallLabelClass}>{t('addTrip.locations.description')}</label>
          <textarea value={draft.description} onChange={(e) => update({ description: e.target.value })}
            placeholder={t('addTrip.locations.descriptionPlaceholder')} rows={2} className={`${smallInputClass} resize-none`} />
        </div>

        <div>
          <label className={smallLabelClass}>{t('addTrip.locations.notes')}</label>
          <textarea value={draft.notes} onChange={(e) => update({ notes: e.target.value })}
            placeholder={t('addTrip.locations.notesPlaceholder')} rows={2} className={`${smallInputClass} resize-none`} />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">{t('addTrip.locations.rating')}</label>
          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <button key={i} type="button" onClick={() => update({ rating: i + 1 === draft.rating ? 0 : i + 1 })}
                className="p-0.5 hover:scale-110 transition-transform">
                <Star size={18} className={draft.rating > i ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-600'} />
              </button>
            ))}
            {draft.rating > 0 && <span className="text-xs text-slate-400 ml-1">{draft.rating}/5</span>}
          </div>
        </div>

        <button type="button" onClick={handleAdd} disabled={!canAdd}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors">
          <Plus size={16} />
          {t('addTrip.locations.addToRoute')}
        </button>
      </div>
    </>
  );
}
