import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Image, ZoomIn, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { photosApi } from '../api/client';
import MediaThumb from './media/MediaThumb';
import Lightbox from './Lightbox';
import type { Trip, Photo } from '../types';

interface PhotoGalleryProps {
  trip: Trip;
  onPhotoDeleted: () => void;
}

export default function PhotoGallery({ trip, onPhotoDeleted }: PhotoGalleryProps) {
  const { t } = useTranslation();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [deletedPhotoIds, setDeletedPhotoIds] = useState<Set<number>>(new Set());

  const allPhotos: Array<Photo & { locationName?: string }> = [
    ...(trip.photos ?? []),
    ...(trip.locations ?? []).flatMap((loc) =>
      (loc.photos ?? []).map((p) => ({ ...p, locationName: loc.name }))
    ),
  ].filter((p) => !deletedPhotoIds.has(p.id));

  const tripLevelPhotos = (trip.photos ?? []).filter((p) => !deletedPhotoIds.has(p.id));

  const locationGroups = (trip.locations ?? [])
    .map((loc) => ({
      ...loc,
      photos: (loc.photos ?? []).filter((p) => !deletedPhotoIds.has(p.id)),
    }))
    .filter((loc) => loc.photos.length > 0)
    .sort((a, b) => a.order_index - b.order_index);

  const openLightbox = (photo: Photo) => {
    const idx = allPhotos.findIndex((p) => p.id === photo.id);
    if (idx !== -1) setLightboxIndex(idx);
  };

  const handleDeletePhoto = async (photo: Photo) => {
    const idx = allPhotos.findIndex((p) => p.id === photo.id);
    if (lightboxIndex === idx) setLightboxIndex(null);
    setDeletedPhotoIds((prev) => new Set([...prev, photo.id]));
    try {
      await photosApi.delete(photo.trip_id, photo.id);
      onPhotoDeleted();
    } catch {
      setDeletedPhotoIds((prev) => {
        const next = new Set(prev);
        next.delete(photo.id);
        return next;
      });
    }
  };

  if (allPhotos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mb-4">
          <Image size={28} className="text-slate-400" />
        </div>
        <p className="text-slate-500 dark:text-slate-400">
          {t('photoGallery.noPhotos')}
        </p>
      </div>
    );
  }

  const PhotoGrid = ({ photos }: { photos: Photo[] }) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {photos.map((photo, i) => (
        <motion.div
          key={photo.id}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.04 }}
          className="photo-grid-item aspect-square bg-slate-200 dark:bg-slate-700 relative group cursor-pointer"
          onClick={() => openLightbox(photo)}
        >
          <MediaThumb photo={photo} className="w-full h-full" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
            <ZoomIn size={22} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          {photo.caption && (
            <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <p className="text-white text-xs line-clamp-1">{photo.caption}</p>
            </div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); if (window.confirm(t('photoGallery.deleteConfirm'))) handleDeletePhoto(photo); }}
            title={t('photoGallery.deletePhoto')}
            className="absolute bottom-1.5 right-1.5 z-10 w-7 h-7 rounded-full bg-red-500/80 hover:bg-red-600 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Trash2 size={13} />
          </button>
        </motion.div>
      ))}
    </div>
  );

  return (
    <>
      <div className="space-y-8">
        {tripLevelPhotos.length > 0 && (
          <section>
            <h3 className="font-playfair text-lg font-semibold text-slate-700 dark:text-slate-200 mb-4">
              {t('photoGallery.generalPhotos')}
            </h3>
            <PhotoGrid photos={tripLevelPhotos} />
          </section>
        )}

        {locationGroups.map((loc) => (
          <section key={loc.id}>
            <h3 className="font-playfair text-lg font-semibold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-300 text-xs flex items-center justify-center font-bold">
                {loc.order_index + 1}
              </span>
              {loc.name}
              {loc.country && <span className="text-sm font-normal text-slate-500">· {loc.country}</span>}
            </h3>
            <PhotoGrid photos={loc.photos} />
          </section>
        ))}
      </div>

      <AnimatePresence>
        {lightboxIndex !== null && (
          <Lightbox
            photos={allPhotos}
            startIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
            placeName={(p) => allPhotos.find((x) => x.id === p.id)?.locationName}
          />
        )}
      </AnimatePresence>
    </>
  );
}
