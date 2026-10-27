import { motion } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LocationDraftForm from './LocationDraftForm';
import type { Location } from '../../types';
import type { LocationDraft } from './types';

interface LocationsStepProps {
  existingLocations: Location[];
  newLocations: LocationDraft[];
  onRemoveExisting: (id: number) => void;
  onAddNew: (draft: LocationDraft) => void;
  onRemoveNew: (index: number) => void;
  onError: (message: string) => void;
}

function RouteItem({ index, name, country, isNew, onRemove }: {
  index: number; name: string; country?: string; isNew?: boolean; onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={`flex items-center gap-3 rounded-xl px-4 py-2.5 ${
      isNew ? 'bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800' : 'bg-slate-50 dark:bg-slate-700'
    }`}>
      <span className={`w-6 h-6 rounded-full text-xs flex items-center justify-center font-bold shrink-0 ${
        isNew ? 'bg-primary-200 dark:bg-primary-800 text-primary-700 dark:text-primary-200' : 'bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-300'
      }`}>{index}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 dark:text-white truncate">{name}</p>
        {country && <p className="text-xs text-slate-500">{country}</p>}
      </div>
      {isNew && <span className="text-xs text-primary-500 font-medium shrink-0 mr-1">{t('common.new')}</span>}
      <button type="button" onClick={onRemove} className="text-slate-400 hover:text-red-500 transition-colors shrink-0">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export default function LocationsStep({
  existingLocations, newLocations, onRemoveExisting, onAddNew, onRemoveNew, onError,
}: LocationsStepProps) {
  const { t } = useTranslation();
  const total = existingLocations.length + newLocations.length;

  return (
    <motion.div key="step2" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} className="space-y-5">
      {total > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            {t('addTrip.locations.routeLabel', { count: total })}
          </p>
          {existingLocations.map((loc, i) => (
            <RouteItem key={loc.id} index={i + 1} name={loc.name} country={loc.country}
              onRemove={() => onRemoveExisting(loc.id)} />
          ))}
          {newLocations.map((loc, i) => (
            <RouteItem key={`new-${i}`} index={existingLocations.length + i + 1} name={loc.name} country={loc.country}
              isNew onRemove={() => onRemoveNew(i)} />
          ))}
        </div>
      )}

      <LocationDraftForm onAdd={onAddNew} onError={onError} />

      <p className="text-xs text-slate-400 text-center">{t('addTrip.locations.manageLater')}</p>
    </motion.div>
  );
}
