import { motion, AnimatePresence } from 'framer-motion';
import { SlidersHorizontal, Plus, X } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/useStore';
import type { Trip } from '../types';
import { tripYear } from '../lib/tripDates';

const TAGS = ['adventure', 'food', 'hiking', 'culture', 'beach', 'city', 'nature'];

interface FilterBarProps {
  trips: Trip[];
  onAddTrip: () => void;
}

export default function FilterBar({ trips, onAddTrip }: FilterBarProps) {
  const { t } = useTranslation();
  const {
    selectedYear, setSelectedYear,
    selectedTags, toggleTag,
    clearFilters, searchQuery,
  } = useStore();

  const years = useMemo(() => {
    const ys = new Set(trips.map(tripYear).filter((y): y is number => y !== null));
    return Array.from(ys).sort((a, b) => b - a);
  }, [trips]);

  const hasFilters = selectedYear !== null || selectedTags.length > 0 || searchQuery !== '';

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Filter icon */}
      <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
        <SlidersHorizontal size={16} />
        <span className="text-sm font-medium hidden sm:block">{t('filterBar.label')}</span>
      </div>

      {/* Year pills */}
      {years.map((year) => (
        <motion.button
          key={year}
          whileTap={{ scale: 0.95 }}
          onClick={() => setSelectedYear(selectedYear === year ? null : year)}
          className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
            selectedYear === year
              ? 'bg-primary-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-primary-400 hover:text-primary-600'
          }`}
        >
          {year}
        </motion.button>
      ))}

      {years.length > 0 && (
        <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 hidden sm:block" />
      )}

      {/* Tag pills */}
      {TAGS.map((tag) => (
        <motion.button
          key={tag}
          whileTap={{ scale: 0.95 }}
          onClick={() => toggleTag(tag)}
          className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
            selectedTags.includes(tag)
              ? 'bg-accent-500 text-white shadow-sm'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-accent-400 hover:text-accent-600'
          }`}
        >
          {t(`tags.${tag}`)}
        </motion.button>
      ))}

      {/* Clear filters */}
      <AnimatePresence>
        {hasFilters && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={clearFilters}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 border border-dashed border-slate-300 dark:border-slate-600 transition-colors"
          >
            <X size={13} />
            {t('filterBar.clearFilters')}
          </motion.button>
        )}
      </AnimatePresence>

      <div className="flex-1" />

      {/* Add trip button */}
      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        onClick={onAddTrip}
        className="flex items-center gap-1.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium px-4 py-2 rounded-xl shadow-sm transition-colors"
      >
        <Plus size={16} />
        {t('filterBar.newTrip')}
      </motion.button>
    </div>
  );
}
