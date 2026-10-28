import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { MapPinOff, Wand2, MapPin, Crosshair, CheckSquare, Square, Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { photosApi } from '../api/client';
import MediaThumb from './media/MediaThumb';
import type { Location, Photo } from '../types';

// A geotagged photo taken within this time of one without GPS is a good guess
const MAX_GAP_MS = 3 * 60 * 60 * 1000;

interface Suggestion { lat: number; lng: number; source: 'time' | 'place' }

/** Where an item without GPS was probably taken. */
export function suggestPositions(media: Photo[], locations: Location[]): Map<number, Suggestion> {
  const anchors = media
    .filter((p) => p.lat != null && p.lng != null && p.taken_at && p.geo_source !== 'estimated')
    .map((p) => ({ t: Date.parse(p.taken_at!), lat: p.lat!, lng: p.lng! }));
  const places = new Map(locations.map((l) => [l.id, l]));

  const result = new Map<number, Suggestion>();
  for (const photo of media) {
    if (photo.lat != null) continue;
    if (photo.taken_at) {
      const t = Date.parse(photo.taken_at);
      let best: { gap: number; lat: number; lng: number } | null = null;
      for (const a of anchors) {
        const gap = Math.abs(a.t - t);
        if (gap <= MAX_GAP_MS && (!best || gap < best.gap)) best = { gap, lat: a.lat, lng: a.lng };
      }
      if (best) { result.set(photo.id, { lat: best.lat, lng: best.lng, source: 'time' }); continue; }
    }
    const place = photo.location_id ? places.get(photo.location_id) : undefined;
    if (place) result.set(photo.id, { lat: place.lat, lng: place.lng, source: 'place' });
  }
  return result;
}

interface UnlocatedMediaPanelProps {
  tripId: number;
  media: Photo[];
  locations: Location[];
  /** Ask the page to let the user click the map for these ids */
  onPickOnMap: (ids: number[]) => void;
  picking: boolean;
  onCancelPick: () => void;
  onChanged: () => void;
}

/** Photos/videos without GPS: suggest, assign to a place, or click on the map. */
export default function UnlocatedMediaPanel({
  tripId, media, locations, onPickOnMap, picking, onCancelPick, onChanged,
}: UnlocatedMediaPanelProps) {
  const { t } = useTranslation();
  const unlocated = media.filter((p) => p.lat == null || p.lng == null);
  const suggestions = useMemo(() => suggestPositions(media, locations), [media, locations]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  if (unlocated.length === 0) return null;

  const toggle = (id: number) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allSelected = selected.size === unlocated.length;
  const ids = [...selected];

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      setSelected(new Set());
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  // Apply suggestions: to the selection, or to everything if nothing is selected
  const applySuggestions = () => run(async () => {
    const targets = (ids.length ? ids : unlocated.map((p) => p.id)).filter((id) => suggestions.has(id));
    // Group by identical position so it's one request per spot
    const groups = new Map<string, number[]>();
    for (const id of targets) {
      const s = suggestions.get(id)!;
      const key = `${s.lat},${s.lng}`;
      groups.set(key, [...(groups.get(key) ?? []), id]);
    }
    for (const [key, group] of groups) {
      const [lat, lng] = key.split(',').map(Number);
      await photosApi.locate(tripId, { ids: group, lat, lng, geo_source: 'estimated' });
    }
  });

  const assignToPlace = (locationId: number) => {
    const place = locations.find((l) => l.id === locationId);
    if (!place || ids.length === 0) return;
    void run(() => photosApi.locate(tripId, { ids, lat: place.lat, lng: place.lng, location_id: place.id, geo_source: 'manual' }));
  };

  const suggestable = (ids.length ? ids : unlocated.map((p) => p.id)).filter((id) => suggestions.has(id)).length;

  return (
    <motion.section id="unlocated-media" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="mt-6 bg-white dark:bg-slate-800 rounded-2xl shadow-card p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-playfair text-base font-semibold text-slate-800 dark:text-white flex items-center gap-2">
            <MapPinOff size={16} className="text-amber-500" />
            {t('locate.title', { count: unlocated.length })}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">{t('locate.explain')}</p>
        </div>
        <button onClick={() => setSelected(allSelected ? new Set() : new Set(unlocated.map((p) => p.id)))}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-primary-600">
          {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
          {allSelected ? t('locate.selectNone') : t('locate.selectAll')}
        </button>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={applySuggestions} disabled={busy || suggestable === 0}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-white text-xs font-medium">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
          {t('locate.applySuggestions', { count: suggestable })}
        </button>
        <select value="" disabled={busy || ids.length === 0 || locations.length === 0}
          onChange={(e) => e.target.value && assignToPlace(Number(e.target.value))}
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-xs text-slate-700 dark:text-slate-200 disabled:opacity-40">
          <option value="">{t('locate.assignToPlace')}</option>
          {locations.map((l, i) => <option key={l.id} value={l.id}>{i + 1}. {l.name}</option>)}
        </select>
        {picking ? (
          <button onClick={onCancelPick}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 text-white text-xs font-medium">
            <X size={14} /> {t('locate.cancelPick')}
          </button>
        ) : (
          <button onClick={() => onPickOnMap(ids)} disabled={busy || ids.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-primary-300 disabled:opacity-40">
            <Crosshair size={14} /> {t('locate.pickOnMap')}
          </button>
        )}
        {ids.length > 0 && <span className="text-xs text-slate-500">{t('locate.selected', { count: ids.length })}</span>}
      </div>
      {picking && <p className="text-xs text-primary-600 font-medium">{t('locate.pickHint', { count: ids.length })}</p>}

      {/* Items */}
      <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2 max-h-80 overflow-y-auto pr-1">
        {unlocated.map((photo) => {
          const isSelected = selected.has(photo.id);
          const suggestion = suggestions.get(photo.id);
          return (
            <button key={photo.id} onClick={() => toggle(photo.id)}
              title={[photo.original_name, photo.taken_at?.replace('T', ' ')].filter(Boolean).join(' · ')}
              className={`relative aspect-square rounded-lg overflow-hidden ring-2 transition-shadow ${
                isSelected ? 'ring-primary-500' : 'ring-transparent hover:ring-slate-300'
              }`}>
              <MediaThumb photo={photo} compact className="w-full h-full" />
              <span className={`absolute top-1 left-1 w-4 h-4 rounded border-2 border-white shadow ${isSelected ? 'bg-primary-500' : 'bg-black/20'}`} />
              {suggestion && (
                <span className="absolute bottom-1 right-1 bg-white/90 text-primary-600 rounded-full p-0.5"
                  title={t(`locate.suggestion.${suggestion.source}`)}>
                  <MapPin size={10} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </motion.section>
  );
}
