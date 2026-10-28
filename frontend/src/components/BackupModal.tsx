import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Download, Upload, Loader2, DatabaseBackup, CheckCircle2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { isAxiosError } from 'axios';
import { backupApi } from '../api/client';
import Portal from './Portal';

/** Download everything as a ZIP, or replace everything with a ZIP. */
export default function BackupModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  const restore = async (file: File | undefined) => {
    if (!file) return;
    if (!window.confirm(t('backup.confirmRestore', { name: file.name }))) return;
    setError('');
    setResult('');
    setProgress(0);
    try {
      const { data } = await backupApi.restore(file, setProgress);
      setResult(t('backup.restored', { trips: data.trips, files: data.files }));
      qc.invalidateQueries();
    } catch (err) {
      const message = isAxiosError(err) ? err.response?.data?.error : undefined;
      setError(message ? `${t('backup.restoreFailed')} (${message})` : t('backup.restoreFailed'));
    } finally {
      setProgress(null);
      if (input.current) input.current.value = '';
    }
  };

  const busy = progress !== null;

  return (
    <Portal>
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={() => !busy && onClose()}>
      <motion.div initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-playfair text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <DatabaseBackup size={18} className="text-primary-500" /> {t('backup.title')}
          </h2>
          <button onClick={onClose} disabled={busy} aria-label={t('common.close')}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-sm text-slate-600 dark:text-slate-300">{t('backup.exportExplain')}</p>
          <a href={backupApi.downloadUrl()} download
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium">
            <Download size={15} /> {t('backup.export')}
          </a>
        </div>

        <div className="space-y-2 pt-4 border-t border-slate-100 dark:border-slate-700">
          <p className="text-sm text-slate-600 dark:text-slate-300">{t('backup.restoreExplain')}</p>
          <button onClick={() => input.current?.click()} disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-sm font-medium hover:border-red-300 hover:text-red-600 disabled:opacity-50">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            {busy ? t('backup.restoring', { percent: Math.round((progress ?? 0) * 100) }) : t('backup.restore')}
          </button>
          <input ref={input} type="file" accept=".zip,application/zip" hidden onChange={(e) => restore(e.target.files?.[0])} />
          {result && <p className="text-sm text-emerald-600 flex items-center gap-1.5"><CheckCircle2 size={15} />{result}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </motion.div>
    </motion.div>
    </Portal>
  );
}
