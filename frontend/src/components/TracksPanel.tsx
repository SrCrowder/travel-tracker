import { useRef, useState } from 'react';
import { Route, Upload, Trash2, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isAxiosError } from 'axios';
import { tracksApi } from '../api/client';
import type { Track } from '../types';

export const TRACK_COLOR = '#EA580C';

export function formatDistance(meters: number, lang: string) {
  return meters >= 1000
    ? `${new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(meters / 1000)} km`
    : `${Math.round(meters)} m`;
}

interface TracksPanelProps {
  tripId: number;
  tracks: Track[];
  onChanged: () => void;
}

/** GPS tracks (GPX/KML from a watch, Strava, Wikiloc, Google My Maps…). */
export default function TracksPanel({ tripId, tracks, onChanged }: TracksPanelProps) {
  const { t, i18n } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError('');
    try {
      for (const file of Array.from(files)) await tracksApi.upload(tripId, file);
    } catch (err) {
      setError(isAxiosError(err) && err.response?.status === 400 ? t('tracks.invalid') : t('tracks.failed'));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
      onChanged();
    }
  };

  const remove = async (track: Track) => {
    if (!window.confirm(t('tracks.deleteConfirm', { name: track.name }))) return;
    await tracksApi.delete(tripId, track.id);
    onChanged();
  };

  return (
    <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-700">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
          <Route size={15} style={{ color: TRACK_COLOR }} /> {t('tracks.title')}
        </h4>
        <button onClick={() => input.current?.click()} disabled={busy}
          className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {t('tracks.upload')}
        </button>
        <input ref={input} type="file" accept=".gpx,.kml,application/gpx+xml,application/vnd.google-earth.kml+xml"
          multiple hidden onChange={(e) => upload(e.target.files)} />
      </div>
      {tracks.length === 0 ? (
        <p className="text-xs text-slate-400">{t('tracks.empty')}</p>
      ) : (
        <ul className="space-y-1.5">
          {tracks.map((track) => (
            <li key={track.id} className="flex items-center gap-2 text-sm group">
              <span className="w-3 h-0.5 rounded shrink-0" style={{ background: TRACK_COLOR }} />
              <span className="flex-1 min-w-0 truncate text-slate-700 dark:text-slate-200">{track.name}</span>
              <span className="text-xs text-slate-400 shrink-0">{formatDistance(track.distance_m, i18n.language)}</span>
              <button onClick={() => remove(track)} aria-label={t('tracks.delete')}
                className="text-slate-300 hover:text-red-500 sm:opacity-0 group-hover:opacity-100"><Trash2 size={13} /></button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}
