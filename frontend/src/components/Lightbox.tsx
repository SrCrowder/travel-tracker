import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Download, Loader2, AlertTriangle, Camera, MapPin } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { mediaUrl, originalUrl, thumbUrl } from '../api/client';
import { useDateLocale } from '../i18n/useDateLocale';
import type { Photo } from '../types';

interface LightboxProps {
  photos: Photo[];
  startIndex: number;
  onClose: () => void;
  /** Optional label per photo (e.g. its location name) */
  placeName?: (photo: Photo) => string | undefined;
}

export default function Lightbox({ photos, startIndex, onClose, placeName }: LightboxProps) {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const [index, setIndex] = useState(startIndex);
  const prev = () => setIndex((i) => (i - 1 + photos.length) % photos.length);
  const next = () => setIndex((i) => (i + 1) % photos.length);

  // Keyboard navigation works without focusing the overlay first
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.length, onClose]);

  const photo = photos[index];
  if (!photo) return null;
  const isVideo = photo.media_type === 'video';
  const takenAt = photo.taken_at ? format(parseISO(photo.taken_at), 'PPP · HH:mm', { locale: dateLocale }) : null;
  const place = placeName?.(photo);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 flex items-center justify-between p-4 z-10" onClick={(e) => e.stopPropagation()}>
        <span className="text-white/60 text-sm">{index + 1} / {photos.length}</span>
        <div className="flex items-center gap-2">
          <a href={originalUrl(photo)} download={photo.original_name || undefined}
            title={t('media.downloadOriginal')} aria-label={t('media.downloadOriginal')}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
            <Download size={18} />
          </a>
          <button onClick={onClose} aria-label={t('common.close')}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Prev */}
      {photos.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); prev(); }}
          className="absolute left-2 sm:left-4 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors z-10"
        >
          <ChevronLeft size={24} />
        </button>
      )}

      {/* Photo / video */}
      <AnimatePresence mode="wait">
        <motion.div
          key={photo.id}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.01 }}
          transition={{ duration: 0.18 }}
          className="max-w-5xl w-full max-h-[85vh] mx-14 sm:mx-20 flex flex-col items-center"
          onClick={(e) => e.stopPropagation()}
        >
          {isVideo && photo.status === 'ready' ? (
            <video key={photo.id} src={mediaUrl(photo)} poster={thumbUrl(photo)} controls autoPlay playsInline
              className="max-w-full max-h-[75vh] rounded-lg shadow-2xl bg-black" />
          ) : isVideo ? (
            <div className="relative">
              <img src={thumbUrl(photo)} alt="" className="max-w-full max-h-[75vh] rounded-lg opacity-60" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white text-sm">
                {photo.status === 'processing'
                  ? <><Loader2 size={28} className="animate-spin" />{t('media.processingLong')}</>
                  : <><AlertTriangle size={28} className="text-amber-300" />{t('media.failedLong')}</>}
              </div>
            </div>
          ) : (
            <img src={mediaUrl(photo)} alt={photo.caption || ''}
              className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl" />
          )}

          {/* Details */}
          <div className="mt-3 text-center space-y-1">
            {photo.caption && <p className="text-white/80 text-sm">{photo.caption}</p>}
            <p className="text-white/50 text-xs flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
              {takenAt && <span>{takenAt}</span>}
              {place && <span className="flex items-center gap-1"><MapPin size={11} />{place}</span>}
              {photo.camera && <span className="flex items-center gap-1"><Camera size={11} />{photo.camera}</span>}
            </p>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Next */}
      {photos.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); next(); }}
          className="absolute right-2 sm:right-4 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors z-10"
        >
          <ChevronRight size={24} />
        </button>
      )}
    </motion.div>
  );
}
