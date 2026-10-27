import { motion } from 'framer-motion';
import { MapPin, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface EmptyStateProps {
  onAddTrip: () => void;
  isFiltered?: boolean;
}

export default function EmptyState({ onAddTrip, isFiltered = false }: EmptyStateProps) {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-20 text-center"
    >
      <div className="w-20 h-20 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center mb-6">
        <MapPin size={36} className="text-primary-500" />
      </div>

      {isFiltered ? (
        <>
          <h3 className="font-playfair text-2xl font-semibold text-slate-700 dark:text-slate-200 mb-2">
            {t('emptyState.filteredTitle')}
          </h3>
          <p className="text-slate-500 dark:text-slate-400 max-w-sm">
            {t('emptyState.filteredBody')}
          </p>
        </>
      ) : (
        <>
          <h3 className="font-playfair text-2xl font-semibold text-slate-700 dark:text-slate-200 mb-2">
            {t('emptyState.emptyTitle')}
          </h3>
          <p className="text-slate-500 dark:text-slate-400 max-w-sm mb-8">
            {t('emptyState.emptyBody')}
          </p>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={onAddTrip}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-xl font-medium shadow-md transition-colors"
          >
            <Plus size={18} />
            {t('emptyState.addFirst')}
          </motion.button>
        </>
      )}
    </motion.div>
  );
}
