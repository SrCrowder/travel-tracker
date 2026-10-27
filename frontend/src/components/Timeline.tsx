import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, eachDayOfInterval } from 'date-fns';
import { MapPin, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDateLocale } from '../i18n/useDateLocale';
import Lightbox from './Lightbox';
import type { Trip, Location, Photo } from '../types';

interface TimelineProps {
  trip: Trip;
}

function getLocationsForDay(date: Date, locations: Location[]): Location[] {
  const dateStr = format(date, 'yyyy-MM-dd');
  return locations.filter((loc) => {
    if (!loc.date_start) return false;
    const start = loc.date_start;
    const end = loc.date_end ?? loc.date_start;
    return dateStr >= start && dateStr <= end;
  });
}

export default function Timeline({ trip }: TimelineProps) {
  const [lightbox, setLightbox] = useState<{ photos: Photo[]; index: number } | null>(null);
  const { t } = useTranslation();
  const dateLocale = useDateLocale();

  const locations = [...(trip.locations ?? [])].sort((a, b) => a.order_index - b.order_index);

  const days = eachDayOfInterval({
    start: new Date(trip.start_date),
    end: new Date(trip.end_date),
  });

  return (
    <>
      <div className="max-w-2xl">
        <div className="relative">
          <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700" />

          <div className="space-y-1">
            {days.map((day, dayIdx) => {
              const dayLocations = getLocationsForDay(day, locations);
              const isFirst = dayIdx === 0;
              const isLast = dayIdx === days.length - 1;

              return (
                <motion.div
                  key={day.toISOString()}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: dayIdx * 0.04, duration: 0.3 }}
                  className="relative flex gap-6"
                >
                  <div className="flex flex-col items-center shrink-0">
                    <div
                      className={`z-10 w-4 h-4 rounded-full border-2 mt-1.5 ${
                        dayLocations.length > 0
                          ? 'bg-primary-500 border-primary-500 shadow-glow'
                          : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                      }`}
                    />
                  </div>

                  <div className={`pb-6 flex-1 ${isLast ? 'pb-0' : ''}`}>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs font-bold text-primary-500 uppercase tracking-widest">
                        {t('timeline.day', { number: dayIdx + 1 })}
                      </span>
                      <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                        {format(day, 'EEEE, MMMM d', { locale: dateLocale })}
                      </span>
                      {(isFirst || isLast) && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium">
                          {isFirst ? t('timeline.departure') : t('timeline.return')}
                        </span>
                      )}
                    </div>

                    {dayLocations.length > 0 ? (
                      <div className="space-y-3">
                        {dayLocations.map((loc) => (
                          <motion.div
                            key={loc.id}
                            whileHover={{ x: 3 }}
                            className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-card border-l-4 border-primary-500"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <MapPin size={14} className="text-primary-500 shrink-0 mt-0.5" />
                                <div>
                                  <span className="font-semibold text-slate-800 dark:text-white text-sm">
                                    {loc.name}
                                  </span>
                                  {loc.country && (
                                    <span className="text-xs text-slate-500 ml-1.5">{loc.country}</span>
                                  )}
                                </div>
                              </div>
                              {loc.rating && (
                                <div className="flex gap-0.5 shrink-0">
                                  {Array.from({ length: loc.rating }).map((_, i) => (
                                    <Star key={i} size={10} className="fill-amber-400 text-amber-400" />
                                  ))}
                                </div>
                              )}
                            </div>

                            {loc.description && (
                              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-3">
                                {loc.description}
                              </p>
                            )}

                            {loc.photos && loc.photos.length > 0 && (
                              <button
                                onClick={() => setLightbox({ photos: loc.photos, index: 0 })}
                                className="mt-2 text-xs text-primary-500 hover:text-primary-600 dark:hover:text-primary-400 font-medium transition-colors"
                              >
                                {t('timeline.photos', { count: loc.photos.length })}
                              </button>
                            )}
                          </motion.div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400 dark:text-slate-500 italic pl-1">
                        {t('timeline.travelDay')}
                      </p>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {lightbox && (
          <Lightbox
            photos={lightbox.photos}
            startIndex={lightbox.index}
            onClose={() => setLightbox(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
