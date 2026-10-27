import { useState, useMemo } from 'react';
import Calendar from 'react-calendar';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDateLocale } from '../i18n/useDateLocale';
import type { Trip, TripDate } from '../types';

interface TripCalendarProps {
  tripDates: TripDate[];
  trips: Trip[];
}

export default function TripCalendar({ tripDates, trips }: TripCalendarProps) {
  const [activeDate, setActiveDate] = useState<Date | null>(null);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const dateLocale = useDateLocale();

  const dateMap = useMemo(() => {
    const map = new Map<string, number[]>();
    tripDates.forEach(({ date, tripId }) => {
      const key = format(date, 'yyyy-MM-dd');
      const existing = map.get(key) ?? [];
      if (!existing.includes(tripId)) map.set(key, [...existing, tripId]);
    });
    return map;
  }, [tripDates]);

  const tripsOnDate = useMemo(() => {
    if (!activeDate) return [];
    const key = format(activeDate, 'yyyy-MM-dd');
    const ids = dateMap.get(key) ?? [];
    return trips.filter((t) => ids.includes(t.id));
  }, [activeDate, dateMap, trips]);

  const tileClassName = ({ date, view }: { date: Date; view: string }) => {
    if (view !== 'month') return null;
    return dateMap.has(format(date, 'yyyy-MM-dd')) ? 'calendar-trip-day' : null;
  };

  const handleDayClick = (date: Date) => {
    const key = format(date, 'yyyy-MM-dd');
    if (dateMap.has(key)) {
      setActiveDate(activeDate && format(activeDate, 'yyyy-MM-dd') === key ? null : date);
    } else {
      setActiveDate(null);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-card">
      <div className="flex items-center gap-2 mb-4">
        <CalendarIcon size={18} className="text-primary-500" />
        <h2 className="font-playfair text-base font-semibold text-slate-800 dark:text-white">
          {t('calendar.title')}
        </h2>
      </div>

      <Calendar
        onClickDay={handleDayClick}
        tileClassName={tileClassName}
        showNeighboringMonth={false}
        className="dark:text-white"
      />

      {/* Legend */}
      <div className="flex items-center gap-2 mt-3 text-xs text-slate-500 dark:text-slate-400">
        <span className="w-3 h-3 rounded bg-amber-200 dark:bg-amber-700 inline-block" />
        {t('calendar.tripDays')}
      </div>

      {/* Selected date info */}
      <AnimatePresence>
        {activeDate && tripsOnDate.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 overflow-hidden"
          >
            <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
                {format(activeDate, 'MMMM d, yyyy', { locale: dateLocale })}
              </p>
              <div className="space-y-2">
                {tripsOnDate.map((trip) => (
                  <motion.button
                    key={trip.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    onClick={() => navigate(`/trip/${trip.id}`)}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl bg-primary-50 dark:bg-primary-900/20 hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors group text-left"
                  >
                    <span className="text-sm font-medium text-primary-800 dark:text-primary-200 line-clamp-1">
                      {trip.title}
                    </span>
                    <ChevronRight
                      size={14}
                      className="text-primary-400 shrink-0 group-hover:translate-x-1 transition-transform"
                    />
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
