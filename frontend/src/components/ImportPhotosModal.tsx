import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  X, Images, Loader2, MapPin, Calendar, CheckCircle2, AlertTriangle, Camera, Video,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { tripsApi, photosApi } from '../api/client';
import {
  MEDIA_ACCEPT, MAX_VIDEO_SIZE, clusterPhotos, dateRange, distanceKm, isVideoFile, mediaSizeValidator,
  readPhotoInfo, reverseGeocode, type PhotoCluster, type PhotoInfo,
} from '../lib/photoImport';
import { inputClass, labelClass } from './addTrip/types';
import type { Trip, UploadFailure, UploadFailureReason } from '../types';

// Refusals that a second try can't fix
const FINAL_REASONS: UploadFailureReason[] = ['unsupported_format', 'too_large', 'video_unsupported_server'];

interface ImportPhotosModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-selects "add to this trip" (when opened from a trip page) */
  defaultTripId?: number;
}

type Step = 'select' | 'reading' | 'review' | 'uploading' | 'done';
type Destination = 'new' | 'existing';

// Photos go 4 per request; videos (possibly GBs) one at a time
const PHOTO_BATCH = 4;
// A location that already exists within this distance gets the photos instead of a new one
const SAME_PLACE_KM = 15;

function batches(files: File[]): File[][] {
  const out: File[][] = files.filter(isVideoFile).map((f) => [f]);
  const photos = files.filter((f) => !isVideoFile(f));
  for (let i = 0; i < photos.length; i += PHOTO_BATCH) out.push(photos.slice(i, i + PHOTO_BATCH));
  return out;
}

export default function ImportPhotosModal({ isOpen, onClose, defaultTripId }: ImportPhotosModalProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>('select');
  const [photos, setPhotos] = useState<PhotoInfo[]>([]);
  const [readCount, setReadCount] = useState(0);
  const [clusters, setClusters] = useState<PhotoCluster[]>([]);
  const [unplaced, setUnplaced] = useState<PhotoInfo[]>([]);
  const [naming, setNaming] = useState(false);
  const [rejected, setRejected] = useState(0);

  const [destination, setDestination] = useState<Destination>(defaultTripId ? 'existing' : 'new');
  const [tripId, setTripId] = useState<number | ''>(defaultTripId ?? '');
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [autoPlaces, setAutoPlaces] = useState(true);

  const [progress, setProgress] = useState({ done: 0, total: 0 });
  // Files that didn't make it, with the reason (and what's needed to retry them)
  const [failed, setFailed] = useState<Array<UploadFailure & { file?: File; locationId: number | null }>>([]);
  const [saved, setSaved] = useState(0);
  const [unlocated, setUnlocated] = useState(0);
  const [resultTripId, setResultTripId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const { data: trips = [] } = useQuery({
    queryKey: ['trips'],
    queryFn: () => tripsApi.getAll().then((r) => r.data),
    enabled: isOpen,
  });

  const reset = () => {
    setStep('select'); setPhotos([]); setReadCount(0); setClusters([]); setUnplaced([]); setRejected(0);
    setDestination(defaultTripId ? 'existing' : 'new'); setTripId(defaultTripId ?? '');
    setTitle(''); setStartDate(''); setEndDate(''); setAutoPlaces(true);
    setProgress({ done: 0, total: 0 }); setFailed([]); setSaved(0); setUnlocated(0); setResultTripId(null); setError('');
  };

  useEffect(() => {
    if (isOpen) reset();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ── 1. Pick files → read their metadata ────────────────────────────────────
  const onDrop = useCallback(async (accepted: File[], rejectedFiles: unknown[]) => {
    setRejected(rejectedFiles.length);
    if (accepted.length === 0) return;
    setStep('reading');
    setReadCount(0);
    const infos = await readPhotoInfo(accepted, setReadCount);
    const grouped = clusterPhotos(infos);
    const range = dateRange(infos);
    setPhotos(infos);
    setClusters(grouped.clusters);
    setUnplaced(grouped.unplaced);
    setStartDate(range?.start ?? '');
    setEndDate(range?.end ?? '');
    setAutoPlaces(grouped.clusters.length > 0);
    setStep('review');
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: MEDIA_ACCEPT,
    maxSize: MAX_VIDEO_SIZE,
    validator: mediaSizeValidator,
    disabled: step !== 'select',
  });

  // ── 2. Name the detected places (reverse geocoding, 1 request/second) ─────
  useEffect(() => {
    if (step !== 'review' || clusters.length === 0 || clusters.every((c) => c.name)) return;
    let cancelled = false;
    setNaming(true);
    (async () => {
      for (let i = 0; i < clusters.length; i++) {
        if (cancelled) return;
        if (clusters[i].name) continue;
        let place = { name: '', country: '', countryCode: '' };
        try {
          place = await reverseGeocode(clusters[i].lat, clusters[i].lng, i18n.language);
        } catch { /* keep coordinates as name */ }
        if (cancelled) return;
        const name = place.name || `${clusters[i].lat.toFixed(3)}, ${clusters[i].lng.toFixed(3)}`;
        setClusters((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...place, name } : c)));
      }
      if (!cancelled) setNaming(false);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, clusters.length]);

  // Suggest a title from the places once they have names
  useEffect(() => {
    if (title || destination !== 'new' || naming || clusters.length === 0) return;
    const countries = [...new Set(clusters.map((c) => c.country).filter(Boolean))];
    if (countries.length) setTitle(t('importPhotos.suggestedTitle', { place: countries.slice(0, 2).join(' & ') }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naming]);

  // ── 3. Create/update the trip, then upload in small batches ───────────────
  const handleImport = async () => {
    setError('');
    if (destination === 'new' && (!title.trim() || !startDate || !endDate)) {
      setError(t('importPhotos.errors.titleDates'));
      return;
    }
    if (destination === 'existing' && tripId === '') {
      setError(t('importPhotos.errors.pickTrip'));
      return;
    }

    setStep('uploading');
    setProgress({ done: 0, total: photos.length });
    const placeList = autoPlaces ? clusters : [];
    const newLocation = (c: PhotoCluster) => ({
      name: c.name, country: c.country, country_code: c.countryCode || null, lat: c.lat, lng: c.lng,
      date_start: c.dateStart ?? '', date_end: c.dateEnd ?? '', description: '', notes: '', rating: 0,
    });

    try {
      // Which location each place's photos go to (null = general trip photos)
      let targetTrip: Trip;
      const locationIds: Array<number | null> = [];

      if (destination === 'new') {
        const form = new FormData();
        form.append('title', title.trim());
        form.append('start_date', startDate);
        form.append('end_date', endDate < startDate ? startDate : endDate);
        form.append('new_locations', JSON.stringify(placeList.map(newLocation)));
        targetTrip = (await tripsApi.create(form)).data;
        targetTrip.locations.forEach((l) => locationIds.push(l.id));
      } else {
        const existing = (await tripsApi.getById(Number(tripId))).data;
        // Reuse nearby existing locations; create the rest
        const toCreate: PhotoCluster[] = [];
        const matches = placeList.map((c) => {
          const near = existing.locations.find((l) => distanceKm(l.lat, l.lng, c.lat, c.lng) <= SAME_PLACE_KM);
          if (!near) toCreate.push(c);
          return near?.id ?? null;
        });

        const form = new FormData();
        const range = dateRange(photos);
        // Make the trip span the photos' dates
        if (range && (!existing.start_date || range.start < existing.start_date)) form.append('start_date', range.start);
        if (range && (!existing.end_date || range.end > existing.end_date)) form.append('end_date', range.end);
        // Photos mean the trip happened (or is happening)
        if (existing.status === 'wishlist' && range) form.append('status', 'done');
        form.append('new_locations', JSON.stringify(toCreate.map(newLocation)));
        targetTrip = (await tripsApi.update(existing.id, form)).data;

        const knownIds = new Set(existing.locations.map((l) => l.id));
        const created = targetTrip.locations.filter((l) => !knownIds.has(l.id)).map((l) => l.id);
        matches.forEach((id) => locationIds.push(id ?? created.shift() ?? null));
      }

      // Group files per destination location
      const groups: Array<{ locationId: number | null; files: File[] }> = placeList.map((c, i) => ({
        locationId: locationIds[i] ?? null,
        files: c.photos.map((p) => p.file),
      }));
      const placed = new Set(groups.flatMap((g) => g.files));
      const general = photos.filter((p) => !placed.has(p.file)).map((p) => p.file);
      if (general.length) groups.push({ locationId: null, files: general });

      setResultTripId(targetTrip.id);
      await uploadAll(targetTrip.id, groups.flatMap((g) => g.files.map((file) => ({ file, locationId: g.locationId }))));
    } catch {
      setError(t('importPhotos.errors.failed'));
      setStep('review');
    }
  };

  /** Uploads in small batches; a failed request is retried once before reporting its files. */
  const uploadAll = async (tripId: number, jobs: Array<{ file: File; locationId: number | null }>) => {
    setStep('uploading');
    setProgress({ done: 0, total: jobs.length });
    const byLocation = new Map<number | null, File[]>();
    for (const job of jobs) byLocation.set(job.locationId, [...(byLocation.get(job.locationId) ?? []), job.file]);

    const failures: typeof failed = [];
    let done = 0, ok = 0, noGps = 0;
    for (const [locationId, files] of byLocation) {
      for (const batch of batches(files)) {
        let result = await photosApi.uploadSafe(tripId, batch, locationId ?? undefined);
        const retryable = result.failed.filter((f) => !FINAL_REASONS.includes(f.reason));
        if (retryable.length) {
          const again = batch.filter((f) => retryable.some((r) => r.name === f.name));
          const second = await photosApi.uploadSafe(tripId, again, locationId ?? undefined);
          result = {
            photos: [...result.photos, ...second.photos],
            failed: [...result.failed.filter((f) => FINAL_REASONS.includes(f.reason)), ...second.failed],
          };
        }
        ok += result.photos.length;
        noGps += result.photos.filter((p) => p.lat == null).length;
        for (const f of result.failed) failures.push({ ...f, file: batch.find((b) => b.name === f.name), locationId });
        done += batch.length;
        setProgress({ done, total: jobs.length });
      }
    }

    setFailed(failures);
    setSaved((n) => n + ok);
    setUnlocated((n) => n + noGps);
    qc.invalidateQueries({ queryKey: ['trips'] });
    qc.invalidateQueries({ queryKey: ['trip', String(tripId)] });
    setStep('done');
  };

  const retryFailed = () => {
    if (!resultTripId) return;
    const jobs = failed.filter((f) => f.file && !FINAL_REASONS.includes(f.reason))
      .map((f) => ({ file: f.file!, locationId: f.locationId }));
    if (jobs.length) void uploadAll(resultTripId, jobs);
  };

  if (!isOpen) return null;

  const geotagged = photos.filter((p) => p.lat !== null).length;
  const videoCount = photos.filter((p) => p.kind === 'video').length;
  const range = dateRange(photos);
  const busy = step === 'reading' || step === 'uploading';
  const close = () => { if (!busy) onClose(); };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={close}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', duration: 0.35 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-2xl bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700">
            <div>
              <h2 className="font-playfair text-xl font-bold text-slate-800 dark:text-white">{t('importPhotos.title')}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{t('importPhotos.subtitle')}</p>
            </div>
            <button onClick={close} disabled={busy}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-40">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* ── Select ── */}
            {step === 'select' && (
              <div {...getRootProps()} className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${
                isDragActive ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20' : 'border-slate-200 dark:border-slate-600 hover:border-primary-300'
              }`}>
                <input {...getInputProps()} />
                <Images size={32} className="mx-auto mb-3 text-primary-400" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('importPhotos.drop')}</p>
                <p className="text-xs text-slate-400 mt-1.5">{t('importPhotos.formats')}</p>
                {rejected > 0 && (
                  <p className="text-xs text-amber-600 mt-3">{t('importPhotos.rejected', { count: rejected })}</p>
                )}
              </div>
            )}

            {/* ── Reading ── */}
            {step === 'reading' && (
              <div className="py-12 flex flex-col items-center gap-3 text-slate-500">
                <Loader2 size={28} className="animate-spin text-primary-500" />
                <p className="text-sm">{t('importPhotos.reading', { done: readCount })}</p>
              </div>
            )}

            {/* ── Review ── */}
            {step === 'review' && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Stat icon={<Camera size={16} />} value={photos.length - videoCount} label={t('importPhotos.stats.photos')} />
                  <Stat icon={<Video size={16} />} value={videoCount} label={t('importPhotos.stats.videos')} />
                  <Stat icon={<MapPin size={16} />} value={geotagged} label={t('importPhotos.stats.withGps')} />
                  <Stat icon={<Calendar size={16} />}
                    value={range ? (range.start === range.end ? range.start : `${range.start} → ${range.end}`) : '—'}
                    label={t('importPhotos.stats.dates')} small />
                </div>

                {clusters.length > 0 && (
                  <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 h-56">
                    <MapContainer
                      bounds={clusters.length > 1 ? clusters.map((c) => [c.lat, c.lng] as [number, number]) : undefined}
                      center={clusters.length === 1 ? [clusters[0].lat, clusters[0].lng] : undefined}
                      zoom={clusters.length === 1 ? 10 : undefined}
                      boundsOptions={{ padding: [30, 30] }}
                      style={{ height: '100%', width: '100%' }}
                    >
                      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
                      {clusters.map((c, i) => (
                        <CircleMarker key={i} center={[c.lat, c.lng]} radius={6 + Math.min(14, Math.sqrt(c.photos.length) * 2)}
                          pathOptions={{ color: '#4F46E5', fillColor: '#6366F1', fillOpacity: 0.6, weight: 2 }}>
                          <Tooltip>{c.name || '…'} · {c.photos.length}</Tooltip>
                        </CircleMarker>
                      ))}
                    </MapContainer>
                  </div>
                )}

                {/* Destination */}
                <div className="space-y-3">
                  <p className={labelClass}>{t('importPhotos.destination')}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(['new', 'existing'] as Destination[]).map((d) => (
                      <button key={d} type="button" onClick={() => setDestination(d)}
                        disabled={d === 'existing' && trips.length === 0}
                        className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors disabled:opacity-40 ${
                          destination === d
                            ? 'bg-primary-600 border-primary-600 text-white'
                            : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-primary-300'
                        }`}>
                        {t(`importPhotos.${d === 'new' ? 'newTrip' : 'existingTrip'}`)}
                      </button>
                    ))}
                  </div>

                  {destination === 'new' ? (
                    <div className="space-y-3">
                      <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass}
                        placeholder={t('addTrip.fields.tripTitlePlaceholder')} />
                      <div className="grid grid-cols-2 gap-3">
                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
                        <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
                      </div>
                    </div>
                  ) : (
                    <>
                      <select value={tripId} onChange={(e) => setTripId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
                        <option value="">{t('importPhotos.pickTrip')}</option>
                        {trips.map((trip) => (
                          <option key={trip.id} value={trip.id}>{trip.title}{trip.start_date ? ` (${trip.start_date.slice(0, 4)})` : ''}</option>
                        ))}
                      </select>
                      <p className="text-xs text-slate-400">{t('importPhotos.extendDates')}</p>
                    </>
                  )}
                </div>

                {/* Places */}
                {clusters.length > 0 && (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
                      <input type="checkbox" checked={autoPlaces} onChange={(e) => setAutoPlaces(e.target.checked)}
                        className="rounded text-primary-600 focus:ring-primary-400" />
                      {t('importPhotos.autoPlaces', { count: clusters.length })}
                      {naming && <Loader2 size={14} className="animate-spin text-primary-500" />}
                    </label>
                    {autoPlaces && (
                      <ol className="space-y-1.5 max-h-48 overflow-y-auto">
                        {clusters.map((c, i) => (
                          <li key={i} className="flex items-center gap-3 bg-slate-50 dark:bg-slate-700/60 rounded-lg px-3 py-2 text-sm">
                            <span className="w-5 h-5 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                            <span className="flex-1 min-w-0 truncate text-slate-700 dark:text-slate-200">
                              {c.name || <span className="text-slate-400">{t('importPhotos.naming')}</span>}
                              {c.country && <span className="text-slate-400 text-xs ml-1.5">{c.country}</span>}
                            </span>
                            <span className="text-xs text-slate-400 shrink-0">
                              {c.dateStart && (c.dateStart === c.dateEnd ? c.dateStart : `${c.dateStart} → ${c.dateEnd}`)} · {c.photos.length} 📷
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}
                    {unplaced.length > 0 && autoPlaces && (
                      <p className="text-xs text-slate-400">{t('importPhotos.unplaced', { count: unplaced.length })}</p>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ── Uploading ── */}
            {step === 'uploading' && (
              <div className="py-10 space-y-4">
                <p className="text-sm text-center text-slate-600 dark:text-slate-300">
                  {t('importPhotos.uploading', { done: progress.done, total: progress.total })}
                </p>
                <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div className="h-full bg-primary-500 transition-all duration-300"
                    style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                </div>
                <p className="text-xs text-center text-slate-400">{t('importPhotos.keepOpen')}</p>
              </div>
            )}

            {/* ── Done ── */}
            {step === 'done' && (
              <div className="py-8 flex flex-col items-center gap-3 text-center">
                {failed.filter((f) => !FINAL_REASONS.includes(f.reason)).length === 0
                  ? <CheckCircle2 size={36} className="text-emerald-500" />
                  : <AlertTriangle size={36} className="text-amber-500" />}
                <p className="text-sm text-slate-700 dark:text-slate-200">
                  {t('importPhotos.done', { count: saved })}
                </p>
                <p className="text-xs text-slate-500 max-w-md">{t('importPhotos.processingNote')}</p>
                {failed.length > 0 && (
                  <div className="w-full max-w-lg text-left text-xs bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 space-y-2">
                    <p className="font-semibold text-amber-800 dark:text-amber-300">{t('importPhotos.failed', { count: failed.length })}</p>
                    {/* Grouped by reason, so the cause is obvious */}
                    {[...new Set(failed.map((f) => f.reason))].map((reason) => {
                      const names = failed.filter((f) => f.reason === reason).map((f) => f.name);
                      return (
                        <div key={reason}>
                          <p className="text-amber-800 dark:text-amber-300">
                            {t(`importPhotos.reasons.${reason}`)} ({names.length})
                          </p>
                          <p className="text-slate-500 break-all">{names.slice(0, 30).join(', ')}{names.length > 30 ? '…' : ''}</p>
                        </div>
                      );
                    })}
                    {failed.some((f) => f.file && !FINAL_REASONS.includes(f.reason)) && (
                      <button onClick={retryFailed}
                        className="mt-1 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium">
                        {t('importPhotos.retryFailed')}
                      </button>
                    )}
                  </div>
                )}
                {unlocated > 0 && resultTripId && (
                  <button onClick={() => { onClose(); navigate(`/trip/${resultTripId}?locate=1`); }}
                    className="flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700">
                    <MapPin size={15} /> {t('importPhotos.locateMissing', { count: unlocated })}
                  </button>
                )}
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl px-4 py-2.5">{error}</p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
            {step === 'review' ? (
              <button onClick={reset} className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200">
                {t('importPhotos.pickOther')}
              </button>
            ) : (
              <button onClick={close} disabled={busy} className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-40">
                {step === 'done' ? t('common.close') : t('common.cancel')}
              </button>
            )}
            {step === 'review' && (
              <button onClick={handleImport}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-xl transition-colors">
                {t('importPhotos.import', { count: photos.length })}
              </button>
            )}
            {step === 'done' && resultTripId && (
              <button onClick={() => { onClose(); navigate(`/trip/${resultTripId}`); }}
                className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-xl transition-colors">
                {t('importPhotos.openTrip')}
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function Stat({ icon, value, label, small }: { icon: React.ReactNode; value: React.ReactNode; label: string; small?: boolean }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-700/60 rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-primary-500 mb-1">{icon}</div>
      <p className={`font-semibold text-slate-800 dark:text-white ${small ? 'text-xs' : 'text-lg'}`}>{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
