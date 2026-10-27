import { useState, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { X, Upload, Loader2, ImagePlus, Film, FileImage } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { photosApi } from '../api/client';
import { MEDIA_ACCEPT, MAX_VIDEO_SIZE, isVideoFile, mediaSizeValidator } from '../lib/photoImport';
import type { Location } from '../types';

const PHOTO_BATCH = 4;

// Browsers can preview these directly; HEIC/TIFF get an icon instead
const PREVIEWABLE = /\.(jpe?g|png|gif|webp|avif)$/i;

function FilePreview({ file }: { file: File }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  if (isVideoFile(file)) {
    return (
      <div className="relative w-full h-full">
        <video src={url} muted preload="metadata" className="w-full h-full object-cover" />
        <Film size={14} className="absolute bottom-1 left-1 text-white drop-shadow" />
      </div>
    );
  }
  if (PREVIEWABLE.test(file.name)) return <img src={url} alt="" className="w-full h-full object-cover" />;
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-slate-400 p-1">
      <FileImage size={18} />
      <span className="text-[9px] truncate max-w-full">{file.name}</span>
    </div>
  );
}

interface PhotoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  tripId: number;
  locations: Location[];
  /** Pre-select a location when opened from the location panel */
  defaultLocationId?: number;
}

export default function PhotoUploadModal({
  isOpen, onClose, onSuccess, tripId, locations, defaultLocationId,
}: PhotoUploadModalProps) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<File[]>([]);
  const [locationId, setLocationId] = useState<number | ''>(defaultLocationId ?? '');
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(0);
  const [error, setError] = useState('');

  const onDrop = useCallback((accepted: File[]) => {
    setFiles((prev) => [...prev, ...accepted]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: MEDIA_ACCEPT,
    maxSize: MAX_VIDEO_SIZE,
    validator: mediaSizeValidator,
  });

  const removeFile = (i: number) =>
    setFiles((prev) => prev.filter((_, idx) => idx !== i));

  const handleUpload = async () => {
    if (files.length === 0) { setError(t('uploadPhotos.errors.noFile')); return; }
    setUploading(true);
    setUploaded(0);
    setError('');
    try {
      // Videos one per request, photos a few at a time
      const batches = files.filter(isVideoFile).map((f) => [f]);
      const photos = files.filter((f) => !isVideoFile(f));
      for (let i = 0; i < photos.length; i += PHOTO_BATCH) batches.push(photos.slice(i, i + PHOTO_BATCH));
      let done = 0;
      for (const batch of batches) {
        await photosApi.upload(tripId, batch, locationId !== '' ? Number(locationId) : undefined, caption || undefined);
        done += batch.length;
        setUploaded(done);
      }
      onSuccess();
      handleClose();
    } catch {
      setError(t('uploadPhotos.errors.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setFiles([]);
    setCaption('');
    setError('');
    setLocationId(defaultLocationId ?? '');
    onClose();
  };

  const sortedLocations = [...locations].sort((a, b) => a.order_index - b.order_index);

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
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', duration: 0.3 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center">
                <ImagePlus size={16} className="text-primary-600 dark:text-primary-400" />
              </div>
              <h2 className="font-playfair text-xl font-bold text-slate-800 dark:text-white">
                {t('uploadPhotos.title')}
              </h2>
            </div>
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div className="p-6 space-y-5">
            {/* Dropzone */}
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-slate-200 dark:border-slate-600 hover:border-primary-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
              }`}
            >
              <input {...getInputProps()} />
              <Upload size={24} className="mx-auto mb-2 text-slate-400" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                {isDragActive ? t('uploadPhotos.dropActive') : t('uploadPhotos.dropIdle')}
              </p>
              <p className="text-xs text-slate-400 mt-1">{t('uploadPhotos.dropHint')}</p>
            </div>

            {/* File previews */}
            {files.length > 0 && (
              <div className="grid grid-cols-4 gap-2 max-h-64 overflow-y-auto">
                {files.map((file, i) => (
                  <div
                    key={`${file.name}-${file.size}-${i}`}
                    className="relative aspect-square rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700 group"
                  >
                    <FilePreview file={file} />
                    <button
                      onClick={() => removeFile(i)}
                      className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                    >
                      <X size={16} className="text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Location selector */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t('uploadPhotos.attachLabel')}
              </label>
              <select
                value={locationId}
                onChange={(e) =>
                  setLocationId(e.target.value === '' ? '' : Number(e.target.value))
                }
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-400 text-sm"
              >
                <option value="">{t('uploadPhotos.generalOption')}</option>
                {sortedLocations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.order_index + 1}. {loc.name}
                    {loc.country ? ` — ${loc.country}` : ''}
                  </option>
                ))}
              </select>
              <p
                className="text-xs text-slate-400 mt-1.5"
                dangerouslySetInnerHTML={{ __html: t('uploadPhotos.locationHint') }}
              />
            </div>

            {/* Caption */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t('uploadPhotos.captionLabel')}{' '}
                <span className="text-slate-400 font-normal">{t('uploadPhotos.captionOptional')}</span>
              </label>
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder={t('uploadPhotos.captionPlaceholder')}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-400 text-sm"
              />
            </div>

            {/* Error */}
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl px-4 py-2.5">
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {files.length === 0
                ? t('uploadPhotos.noPhotos')
                : t('uploadPhotos.ready', { count: files.length })}
            </span>
            <div className="flex gap-3">
              <button
                onClick={handleClose}
                className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 px-4 py-2 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading || files.length === 0}
                className="flex items-center gap-2 px-5 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
              >
                {uploading ? (
                  <><Loader2 size={15} className="animate-spin" /> {t('common.uploading')} {uploaded}/{files.length}</>
                ) : (
                  <>
                    <Upload size={15} />
                    {files.length > 0
                      ? t('uploadPhotos.uploadButton', { count: files.length })
                      : t('uploadPhotos.title')}
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
