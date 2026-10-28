import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Link2, Copy, Check, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { tripsApi } from '../api/client';
import type { Trip } from '../types';
import Portal from './Portal';

interface ShareDialogProps {
  trip: Trip;
  onClose: () => void;
  onChanged: () => void;
}

export const shareUrl = (token: string) => `${window.location.origin}/share/${token}`;

/** Create, copy or revoke the read-only link of a trip. */
export default function ShareDialog({ trip, onClose, onChanged }: ShareDialogProps) {
  const { t } = useTranslation();
  const [token, setToken] = useState(trip.share_token ?? null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const run = async (action: () => Promise<string | null>) => {
    setBusy(true);
    try {
      setToken(await action());
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!token) return;
    await navigator.clipboard?.writeText(shareUrl(token));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Portal>
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-playfair text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Link2 size={18} className="text-primary-500" /> {t('share.title')}
          </h2>
          <button onClick={onClose} aria-label={t('common.close')}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('share.explain')}</p>

        {token ? (
          <>
            <div className="flex gap-2">
              <input readOnly value={shareUrl(token)} onFocus={(e) => e.target.select()}
                className="flex-1 min-w-0 px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-200" />
              <button onClick={copy}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium">
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? t('share.copied') : t('share.copy')}
              </button>
            </div>
            <button disabled={busy} onClick={() => run(async () => { await tripsApi.unshare(trip.id); return null; })}
              className="text-sm text-red-600 hover:underline disabled:opacity-50">
              {t('share.revoke')}
            </button>
          </>
        ) : (
          <button disabled={busy} onClick={() => run(async () => (await tripsApi.share(trip.id)).data.share_token)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium disabled:opacity-60">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
            {t('share.create')}
          </button>
        )}
      </motion.div>
    </motion.div>
    </Portal>
  );
}
