import { useCallback } from 'react';
import { motion } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { Upload, CheckCircle2, CalendarClock, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import CoverPositionPicker from '../CoverPositionPicker';
import { AVAILABLE_TAGS, CURRENCIES, TRIP_STATUSES, inputClass, labelClass, type TripFormValues } from './types';

const STATUS_ICONS = { done: CheckCircle2, planned: CalendarClock, wishlist: Sparkles };

interface TripInfoStepProps {
  values: TripFormValues;
  onChange: (patch: Partial<TripFormValues>) => void;
}

export default function TripInfoStep({ values, onChange }: TripInfoStepProps) {
  const { t } = useTranslation();

  const onDrop = useCallback((accepted: File[]) => {
    const file = accepted[0];
    if (!file) return;
    // Reset position when a new image is dropped
    onChange({ coverFile: file, coverPreview: URL.createObjectURL(file), coverPosX: 50, coverPosY: 50 });
  }, [onChange]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
  });

  const toggleTag = (tag: string) =>
    onChange({ tags: values.tags.includes(tag) ? values.tags.filter((x) => x !== tag) : [...values.tags, tag] });

  return (
    <motion.div key="step1" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="space-y-5">
      <div>
        <label className={labelClass}>{t('addTrip.fields.tripTitle')}</label>
        <input type="text" value={values.title} onChange={(e) => onChange({ title: e.target.value })}
          placeholder={t('addTrip.fields.tripTitlePlaceholder')} className={inputClass} />
      </div>

      {/* Done / planned / wishlist */}
      <div className="grid grid-cols-3 gap-2">
        {TRIP_STATUSES.map((status) => {
          const Icon = STATUS_ICONS[status];
          return (
            <button key={status} type="button" onClick={() => onChange({ status })}
              className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-xs sm:text-sm font-medium border transition-colors ${
                values.status === status
                  ? 'bg-primary-600 border-primary-600 text-white'
                  : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-primary-300'
              }`}>
              <Icon size={14} />
              {t(`tripStatus.${status}`)}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>
            {t(values.status === 'wishlist' ? 'addTrip.fields.startDateOptional' : 'addTrip.fields.startDate')}
          </label>
          <input type="date" value={values.startDate} onChange={(e) => onChange({ startDate: e.target.value })} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>
            {t(values.status === 'wishlist' ? 'addTrip.fields.endDateOptional' : 'addTrip.fields.endDate')}
          </label>
          <input type="date" value={values.endDate} min={values.startDate} onChange={(e) => onChange({ endDate: e.target.value })} className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div>
          <label className={labelClass}>{t('addTrip.fields.budget')}</label>
          <input type="number" min={0} step="any" inputMode="decimal" value={values.budget}
            onChange={(e) => onChange({ budget: e.target.value })} placeholder={t('addTrip.fields.budgetPlaceholder')}
            className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>{t('addTrip.fields.currency')}</label>
          <select value={values.currency} onChange={(e) => onChange({ currency: e.target.value })} className={inputClass}>
            {[...new Set([values.currency, ...CURRENCIES])].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass}>{t('addTrip.fields.description')}</label>
        <textarea value={values.description} onChange={(e) => onChange({ description: e.target.value })}
          placeholder={t('addTrip.fields.descriptionPlaceholder')} rows={3} className={`${inputClass} resize-none`} />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('addTrip.fields.tags')}</label>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_TAGS.map((tag) => (
            <button key={tag} type="button" onClick={() => toggleTag(tag)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-all ${
                values.tags.includes(tag) ? 'bg-primary-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}>
              {t(`tags.${tag}`)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('addTrip.fields.coverImage')}</label>
        {values.coverPreview ? (
          <CoverPositionPicker
            imageUrl={values.coverPreview}
            x={values.coverPosX}
            y={values.coverPosY}
            onChange={(x, y) => onChange({ coverPosX: x, coverPosY: y })}
            onRemove={() => onChange({ coverFile: null, coverPreview: '', coverPosX: 50, coverPosY: 50 })}
          />
        ) : (
          <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
            isDragActive ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20' : 'border-slate-200 dark:border-slate-600 hover:border-primary-300'
          }`}>
            <input {...getInputProps()} />
            <Upload size={20} className="mx-auto mb-2 text-slate-400" />
            <p className="text-sm text-slate-500">{t('addTrip.fields.coverDrop')}</p>
            <p className="text-xs text-slate-400 mt-1">{t('addTrip.fields.coverFormats')}</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
