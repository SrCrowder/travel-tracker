import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Users, UserPlus, KeyRound, Trash2, Loader2, CheckCircle2, Info } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { isAxiosError } from 'axios';
import { format, parseISO } from 'date-fns';
import { usersApi, type AppUser } from '../api/client';
import { useDateLocale } from '../i18n/useDateLocale';
import Portal from './Portal';

const inputClass =
  'w-full min-w-0 px-3 py-2 text-sm bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-xl border border-transparent focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-400/20';

/** The admin's users: they can log in to open share links, nothing else. */
export default function UsersModal({ loginEnabled, onClose }: { loginEnabled: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const qc = useQueryClient();
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list().then((r) => r.data),
  });

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // User whose password is being changed
  const [editing, setEditing] = useState<{ id: number; password: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // SQLite datetime('now') is UTC without a zone
  const when = (value: string) => format(parseISO(`${value.replace(' ', 'T')}Z`), 'PPp', { locale: dateLocale });

  const run = async (action: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      await qc.invalidateQueries({ queryKey: ['users'] });
      if (done) setNotice(done);
      return true;
    } catch (err) {
      const status = isAxiosError(err) ? err.response?.status : undefined;
      setError(status === 409 ? t('users.taken') : status === 400 ? t('users.invalid') : t('users.error'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await run(() => usersApi.create(username.trim(), password))) {
      setUsername('');
      setPassword('');
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    if (await run(() => usersApi.update(editing.id, { password: editing.password }), t('users.passwordChanged'))) {
      setEditing(null);
    }
  };

  const remove = (user: AppUser) => {
    if (window.confirm(t('users.deleteConfirm', { name: user.username }))) void run(() => usersApi.delete(user.id));
  };

  return (
    <Portal>
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={() => !busy && onClose()}>
      <motion.div initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-playfair text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Users size={18} className="text-primary-500" /> {t('users.title')}
          </h2>
          <button onClick={onClose} disabled={busy} aria-label={t('common.close')}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40">
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-300">{t('users.explain')}</p>
        {!loginEnabled && (
          <p className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 flex gap-2">
            <Info size={16} className="shrink-0 mt-0.5" /> {t('users.loginOff')}
          </p>
        )}

        {/* New user */}
        <form onSubmit={add} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t('users.username')}
            aria-label={t('users.username')} autoComplete="off" required maxLength={64} className={inputClass} />
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('users.password')}
            aria-label={t('users.password')} title={t('users.passwordHint')} type="password" autoComplete="new-password"
            required minLength={8} className={inputClass} />
          <button type="submit" disabled={busy}
            className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-medium">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />} {t('users.add')}
          </button>
        </form>
        <p className="text-xs text-slate-400 -mt-3">{t('users.passwordHint')}</p>

        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {notice && <p className="text-sm text-emerald-600 flex items-center gap-1.5"><CheckCircle2 size={15} />{notice}</p>}

        {/* List */}
        <div className="divide-y divide-slate-100 dark:divide-slate-700 border-t border-slate-100 dark:border-slate-700">
          {isLoading && <p className="py-4 text-sm text-slate-400"><Loader2 size={15} className="animate-spin inline" /></p>}
          {!isLoading && users.length === 0 && <p className="py-4 text-sm text-slate-400 italic">{t('users.empty')}</p>}
          {users.map((user) => (
            <div key={user.id} className="py-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{user.username}</p>
                  <p className="text-xs text-slate-400">
                    {user.last_login_at ? t('users.lastLogin', { date: when(user.last_login_at) }) : t('users.neverLoggedIn')}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setEditing(editing?.id === user.id ? null : { id: user.id, password: '' })}
                    title={t('users.changePassword')} aria-label={t('users.changePassword')} disabled={busy}
                    className="p-2 rounded-lg text-slate-500 hover:text-primary-600 hover:bg-slate-100 dark:hover:bg-slate-700">
                    <KeyRound size={16} />
                  </button>
                  <button onClick={() => remove(user)} title={t('users.delete')} aria-label={t('users.delete')} disabled={busy}
                    className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              {editing?.id === user.id && (
                <form onSubmit={changePassword} className="flex gap-2">
                  <input value={editing.password} onChange={(e) => setEditing({ id: user.id, password: e.target.value })}
                    placeholder={t('users.newPassword')} aria-label={t('users.newPassword')} type="password"
                    autoComplete="new-password" autoFocus required minLength={8} className={inputClass} />
                  <button type="submit" disabled={busy}
                    className="px-3 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-medium">
                    {t('users.save')}
                  </button>
                  <button type="button" onClick={() => setEditing(null)}
                    className="px-3 py-2 rounded-xl text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
                    {t('users.cancel')}
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
    </Portal>
  );
}
