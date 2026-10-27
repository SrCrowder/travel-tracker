import { motion } from 'framer-motion';
import { Sun, Moon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/useStore';

export default function DarkModeToggle() {
  const { darkMode, toggleDarkMode } = useStore();
  const { t } = useTranslation();

  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={toggleDarkMode}
      aria-label={darkMode ? t('darkMode.toLight') : t('darkMode.toDark')}
      className="relative w-14 h-7 rounded-full transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      style={{ background: darkMode ? '#4F46E5' : '#CBD5E1' }}
    >
      <motion.div
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow flex items-center justify-center"
        style={{ left: darkMode ? 'calc(100% - 1.625rem)' : '0.125rem' }}
      >
        {darkMode ? (
          <Moon size={13} className="text-primary-600" />
        ) : (
          <Sun size={13} className="text-amber-500" />
        )}
      </motion.div>
    </motion.button>
  );
}
