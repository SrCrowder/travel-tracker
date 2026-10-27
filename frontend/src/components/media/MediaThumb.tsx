import { Play, Loader2, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { thumbUrl } from '../../api/client';
import type { Photo } from '../../types';

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || !Number.isFinite(seconds)) return '';
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

interface MediaThumbProps {
  photo: Photo;
  className?: string;
  /** Hide the duration badge (tiny thumbnails) */
  compact?: boolean;
}

/** Square-ish preview of a photo or video, with play / processing badges. */
export default function MediaThumb({ photo, className = '', compact }: MediaThumbProps) {
  const { t } = useTranslation();
  const isVideo = photo.media_type === 'video';

  return (
    <div className={`relative overflow-hidden bg-slate-200 dark:bg-slate-700 ${className}`}>
      <img src={thumbUrl(photo)} alt={photo.caption || photo.original_name} loading="lazy"
        className="w-full h-full object-cover" />

      {isVideo && photo.status === 'ready' && (
        <>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className={`${compact ? 'w-6 h-6' : 'w-10 h-10'} rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center`}>
              <Play size={compact ? 12 : 18} className="text-white fill-white ml-0.5" />
            </span>
          </div>
          {!compact && photo.duration ? (
            <span className="absolute bottom-1.5 left-1.5 text-[10px] font-medium text-white bg-black/60 rounded px-1.5 py-0.5 pointer-events-none">
              {formatDuration(photo.duration)}
            </span>
          ) : null}
        </>
      )}

      {photo.status === 'processing' && (
        <div className="absolute inset-0 bg-black/45 flex flex-col items-center justify-center gap-1 text-white pointer-events-none">
          <Loader2 size={compact ? 14 : 20} className="animate-spin" />
          {!compact && <span className="text-[10px] font-medium">{t('media.processing')}</span>}
        </div>
      )}

      {photo.status === 'failed' && (
        <div className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center gap-1 text-amber-300 pointer-events-none"
          title={t('media.failed')}>
          <AlertTriangle size={compact ? 14 : 20} />
          {!compact && <span className="text-[10px] font-medium text-white">{t('media.failed')}</span>}
        </div>
      )}
    </div>
  );
}
