import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, Compass, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DarkModeToggle from './DarkModeToggle';
import { useStore } from '../store/useStore';
import i18n from '../i18n';
import type { Language } from '../store/useStore';

interface NavbarProps {
  onAddTrip?: () => void;
}

export default function Navbar({ onAddTrip }: NavbarProps) {
  const { searchQuery, setSearchQuery, language, setLanguage } = useStore();
  const { t } = useTranslation();
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Global keyboard shortcut: Cmd/Ctrl+K to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate('/');
  };

  const handleLanguageChange = (lang: Language) => {
    i18n.changeLanguage(lang);
    setLanguage(lang);
  };

  return (
    <nav className="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-700/60 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-sm group-hover:shadow-glow transition-shadow">
              <Compass size={18} className="text-white" />
            </div>
            <span className="font-playfair font-bold text-xl text-slate-800 dark:text-white hidden sm:block">
              {t('nav.title')}
            </span>
          </Link>

          {/* Search bar */}
          <form onSubmit={handleSearchSubmit} className="flex-1 max-w-md">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder={t('nav.searchPlaceholder')}
                className="w-full pl-9 pr-9 py-2 text-sm bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 rounded-xl border border-transparent focus:border-primary-400 focus:bg-white dark:focus:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-400/20 transition-all"
              />
              <AnimatePresence>
                {searchQuery && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <X size={14} />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </form>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">

            {/* Language selector */}
            <div className="flex items-center text-sm font-medium">
              {(['es', 'en'] as Language[]).map((lang, i) => (
                <span key={lang} className="flex items-center">
                  {i > 0 && <span className="text-slate-300 dark:text-slate-600 mx-0.5">|</span>}
                  <button
                    onClick={() => handleLanguageChange(lang)}
                    className={`px-1.5 py-0.5 rounded transition-colors ${
                      language === lang
                        ? 'text-primary-600 dark:text-primary-400 font-semibold'
                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                    }`}
                  >
                    {lang.toUpperCase()}
                  </button>
                </span>
              ))}
            </div>

            <DarkModeToggle />

            {onAddTrip && (
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={onAddTrip}
                className="flex items-center gap-1.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium px-4 py-2 rounded-xl shadow-sm transition-colors"
              >
                <Plus size={16} />
                <span className="hidden sm:block">{t('nav.newTrip')}</span>
              </motion.button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
