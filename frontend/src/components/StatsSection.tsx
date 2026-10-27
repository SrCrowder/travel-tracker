import { motion } from 'framer-motion';
import { Map, Globe, CalendarDays, Camera } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Trip } from '../types';
import { tripDays } from '../lib/tripDates';

interface StatsSectionProps {
  trips: Trip[];
}

export default function StatsSection({ trips }: StatsSectionProps) {
  const { t } = useTranslation();

  const totalDays = trips.reduce((sum, trip) => sum + (tripDays(trip) ?? 0), 0);

  const countries = new Set(
    trips.flatMap((t) => t.locations?.map((l) => l.country).filter(Boolean) ?? [])
  );

  const totalLocations = trips.reduce((sum, t) => sum + (t.locations?.length ?? 0), 0);

  const stats = [
    { icon: Map,          labelKey: 'stats.adventures',    value: trips.length,     gradient: 'from-indigo-400 to-indigo-600',  bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
    { icon: Globe,        labelKey: 'stats.countries',     value: countries.size,   gradient: 'from-emerald-400 to-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
    { icon: CalendarDays, labelKey: 'stats.daysTravelled', value: totalDays,        gradient: 'from-amber-400 to-amber-500',     bg: 'bg-amber-50 dark:bg-amber-900/20' },
    { icon: Camera,       labelKey: 'stats.locations',     value: totalLocations,   gradient: 'from-rose-400 to-rose-600',       bg: 'bg-rose-50 dark:bg-rose-900/20' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.labelKey}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08 }}
          className={`${stat.bg} rounded-2xl p-5 border border-white dark:border-slate-700/50 shadow-card`}
        >
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center mb-3 shadow-sm`}>
            <stat.icon size={20} className="text-white" />
          </div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.08 + 0.2 }}
            className="text-3xl font-bold text-slate-800 dark:text-white font-playfair"
          >
            {stat.value}
          </motion.p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
            {t(stat.labelKey)}
          </p>
        </motion.div>
      ))}
    </div>
  );
}
