import { useState } from 'react';
import { motion } from 'framer-motion';
import { Compass, LogIn } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { authApi } from '../api/client';
import DarkModeToggle from '../components/DarkModeToggle';

export default function Login({ subtitle }: { subtitle?: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const { data } = await authApi.login(username, password);
      queryClient.setQueryData(['auth'], data);
      // Anything fetched while logged out failed with 401 — fetch it again
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
    } catch (err) {
      const status = isAxiosError(err) ? err.response?.status : undefined;
      setError(status === 401 ? t('auth.invalid') : status === 429 ? t('auth.tooMany') : t('auth.error'));
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2.5 text-sm bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-xl border border-transparent focus:border-primary-400 focus:bg-white dark:focus:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-400/20 transition-all';

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="absolute top-4 right-4">
        <DarkModeToggle />
      </div>

      <motion.form
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white dark:bg-slate-800/60 rounded-2xl shadow-card border border-slate-200/60 dark:border-slate-700/60 p-8"
      >
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-sm mb-4">
            <Compass size={24} className="text-white" />
          </div>
          <h1 className="font-playfair font-bold text-2xl text-slate-800 dark:text-white">{t('auth.title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{subtitle ?? t('auth.subtitle')}</p>
        </div>

        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5" htmlFor="username">
          {t('auth.username')}
        </label>
        <input
          id="username"
          autoComplete="username"
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className={`${inputClass} mb-4`}
          required
        />

        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5" htmlFor="password">
          {t('auth.password')}
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
          required
        />

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400 mt-3">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full mt-6 flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-sm transition-colors"
        >
          <LogIn size={16} />
          {submitting ? t('auth.submitting') : t('auth.submit')}
        </button>
      </motion.form>
    </div>
  );
}
