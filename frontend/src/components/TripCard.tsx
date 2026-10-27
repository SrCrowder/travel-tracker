import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, MapPin, Clock, Sparkles, CalendarClock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getImageUrl } from '../api/client';
import { useDateLocale } from '../i18n/useDateLocale';
import { formatTripRange, tripDays } from '../lib/tripDates';
import type { Trip } from '../types';

const TAG_COLORS: Record<string, string> = {
  adventure: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  food:      'bg-green-100  text-green-700  dark:bg-green-900/30  dark:text-green-300',
  hiking:    'bg-lime-100   text-lime-700   dark:bg-lime-900/30   dark:text-lime-300',
  culture:   'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  beach:     'bg-sky-100    text-sky-700    dark:bg-sky-900/30    dark:text-sky-300',
  city:      'bg-slate-100  text-slate-600  dark:bg-slate-700     dark:text-slate-300',
  nature:    'bg-teal-100   text-teal-700   dark:bg-teal-900/30   dark:text-teal-300',
  default:   'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300',
};

interface TripCardProps {
  trip: Trip;
}

export default function TripCard({ trip }: TripCardProps) {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();

  const durationDays = tripDays(trip);
  const dateRange = formatTripRange(trip, dateLocale);

  const locationNames = trip.locations
    ?.slice(0, 3)
    .map((l) => l.name)
    .join(' → ');

  return (
    <Link to={`/trip/${trip.id}`} className="block h-full">
      <motion.article
        whileHover={{ y: -5 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="h-full bg-white dark:bg-slate-800 rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-shadow group cursor-pointer"
      >
        {/* Cover image */}
        <div className="relative h-48 overflow-hidden bg-gradient-to-br from-primary-400 to-primary-600">
          {trip.cover_image ? (
            <img
              src={getImageUrl(trip.cover_image)}
              alt={trip.title}
              loading="lazy"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              style={{ objectPosition: `${trip.cover_position_x ?? 50}% ${trip.cover_position_y ?? 50}%` }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center opacity-40">
              <span className="text-7xl select-none">✈️</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          {durationDays !== null && (
            <div className="absolute top-3 right-3 flex items-center gap-1 bg-black/40 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-full font-medium">
              <Clock size={11} />
              {durationDays}d
            </div>
          )}
          {trip.status !== 'done' && (
            <div className={`absolute top-3 left-3 flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-semibold shadow-sm ${
              trip.status === 'planned' ? 'bg-amber-400 text-amber-950' : 'bg-pink-500 text-white'
            }`}>
              {trip.status === 'planned' ? <CalendarClock size={11} /> : <Sparkles size={11} />}
              {t(`tripStatus.${trip.status}`)}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-5">
          {trip.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {trip.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    TAG_COLORS[tag] ?? TAG_COLORS.default
                  }`}
                >
                  {t(`tags.${tag}`, tag)}
                </span>
              ))}
              {trip.tags.length > 3 && (
                <span className="text-xs text-slate-400 px-1">
                  +{trip.tags.length - 3}
                </span>
              )}
            </div>
          )}

          <h3 className="font-playfair text-lg font-semibold text-slate-800 dark:text-white mb-2 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors line-clamp-2">
            {trip.title}
          </h3>

          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-sm mb-1.5">
            <Calendar size={13} className="shrink-0" />
            <span>{dateRange ?? t('tripCard.noDates')}</span>
          </div>

          {trip.locations && trip.locations.length > 0 && (
            <div className="flex items-start gap-1.5 text-slate-500 dark:text-slate-400 text-sm mb-3">
              <MapPin size={13} className="shrink-0 mt-0.5" />
              <span className="truncate">
                {locationNames}
                {trip.locations.length > 3 && ` ${t('tripCard.moreLocations', { count: trip.locations.length - 3 })}`}
              </span>
            </div>
          )}

          {trip.description && (
            <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
              {trip.description}
            </p>
          )}
        </div>
      </motion.article>
    </Link>
  );
}
