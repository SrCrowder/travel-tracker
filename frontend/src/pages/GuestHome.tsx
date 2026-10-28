import { Compass, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DarkModeToggle from '../components/DarkModeToggle';
import { useLogout } from '../hooks/useLogout';

/** What a user who isn't the admin sees outside a share link. */
export default function GuestHome({ name }: { name: string }) {
  const { t } = useTranslation();
  const logout = useLogout();
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="absolute top-4 right-4"><DarkModeToggle /></div>
      <div className="w-full max-w-sm bg-white dark:bg-slate-800/60 rounded-2xl shadow-card border border-slate-200/60 dark:border-slate-700/60 p-8 text-center">
        <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-sm mb-4">
          <Compass size={24} className="text-white" />
        </div>
        <h1 className="font-playfair font-bold text-2xl text-slate-800 dark:text-white">{t('auth.guestTitle', { name })}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{t('auth.guestExplain')}</p>
        <button onClick={logout}
          className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-medium text-slate-700 dark:text-slate-200 hover:border-primary-300">
          <LogOut size={15} /> {t('auth.logout')}
        </button>
      </div>
    </div>
  );
}
