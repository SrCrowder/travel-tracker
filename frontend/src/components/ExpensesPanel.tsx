import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, Loader2, Wallet, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { expensesApi, type ExpenseInput } from '../api/client';
import { useDateLocale } from '../i18n/useDateLocale';
import { CURRENCIES, inputClass } from './addTrip/types';
import { EXPENSE_CATEGORIES, type Expense, type ExpenseCategory, type Trip } from '../types';

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  transport: 'bg-sky-500', lodging: 'bg-violet-500', food: 'bg-emerald-500',
  activities: 'bg-amber-500', shopping: 'bg-pink-500', other: 'bg-slate-400',
};

interface Draft {
  date: string;
  category: ExpenseCategory;
  description: string;
  amount: string;
  currency: string;
  location_id: string;
}

export function formatMoney(amount: number, currency: string, lang: string) {
  try {
    return new Intl.NumberFormat(lang, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export default function ExpensesPanel({ trip }: { trip: Trip }) {
  const { t, i18n } = useTranslation();
  const dateLocale = useDateLocale();
  const qc = useQueryClient();
  const queryKey = ['expenses', trip.id];
  const { data: expenses = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => expensesApi.list(trip.id).then((r) => r.data),
  });

  const emptyDraft = (): Draft => ({
    date: trip.start_date ?? '', category: 'food', description: '', amount: '', currency: trip.currency, location_id: '',
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const money = (amount: number, currency: string) => formatMoney(amount, currency, i18n.language);

  // Totals per currency (no exchange rates: each currency is summed on its own)
  const totals = new Map<string, number>();
  const byCategory = new Map<ExpenseCategory, number>();
  for (const e of expenses) {
    totals.set(e.currency, (totals.get(e.currency) ?? 0) + e.amount);
    if (e.currency === trip.currency) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
  }
  const spent = totals.get(trip.currency) ?? 0;
  const budget = trip.budget ?? null;
  const days = trip.start_date && trip.end_date
    ? Math.round((parseISO(trip.end_date).getTime() - parseISO(trip.start_date).getTime()) / 86_400_000) + 1 : null;

  const startEdit = (e: Expense) => {
    setEditingId(e.id);
    setDraft({
      date: e.date ?? '', category: e.category, description: e.description, amount: String(e.amount),
      currency: e.currency, location_id: e.location_id ? String(e.location_id) : '',
    });
  };

  const save = async () => {
    if (!draft) return;
    const amount = Number(draft.amount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount < 0 || draft.amount === '') {
      setError(t('expenses.errors.amount'));
      return;
    }
    const data: ExpenseInput = {
      date: draft.date || null, category: draft.category, description: draft.description, amount,
      currency: draft.currency, location_id: draft.location_id ? Number(draft.location_id) : null,
    };
    setSaving(true);
    setError('');
    try {
      if (editingId) await expensesApi.update(trip.id, editingId, data);
      else await expensesApi.create(trip.id, data);
      await qc.invalidateQueries({ queryKey });
      setDraft(null);
      setEditingId(null);
    } catch {
      setError(t('expenses.errors.save'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (e: Expense) => {
    if (!window.confirm(t('expenses.deleteConfirm'))) return;
    await expensesApi.delete(trip.id, e.id);
    qc.invalidateQueries({ queryKey });
  };

  const locationName = (id: number | null) => trip.locations.find((l) => l.id === id)?.name;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Summary */}
      <div className="space-y-4 lg:order-2">
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-card space-y-4">
          <h3 className="font-playfair text-base font-semibold text-slate-800 dark:text-white flex items-center gap-2">
            <Wallet size={16} className="text-primary-500" /> {t('expenses.summary')}
          </h3>
          <p className="text-3xl font-bold text-slate-800 dark:text-white">{money(spent, trip.currency)}</p>
          {[...totals].filter(([c]) => c !== trip.currency).map(([c, total]) => (
            <p key={c} className="text-sm text-slate-500">+ {money(total, c)}</p>
          ))}

          {budget !== null && budget > 0 && (
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>{t('expenses.budget')} {money(budget, trip.currency)}</span>
                <span className={spent > budget ? 'text-red-600 font-semibold' : ''}>{Math.round((spent / budget) * 100)}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                <div className={`h-full ${spent > budget ? 'bg-red-500' : 'bg-primary-500'}`}
                  style={{ width: `${Math.min(100, (spent / budget) * 100)}%` }} />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {spent > budget
                  ? t('expenses.over', { amount: money(spent - budget, trip.currency) })
                  : t('expenses.left', { amount: money(budget - spent, trip.currency) })}
              </p>
            </div>
          )}
          {days !== null && spent > 0 && (
            <p className="text-sm text-slate-500">{t('expenses.perDay', { amount: money(spent / days, trip.currency) })}</p>
          )}

          {byCategory.size > 0 && (
            <div className="space-y-2 pt-1">
              {[...byCategory].sort((a, b) => b[1] - a[1]).map(([cat, total]) => (
                <div key={cat}>
                  <div className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
                    <span>{t(`expenses.categories.${cat}`)}</span><span>{money(total, trip.currency)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden mt-1">
                    <div className={`h-full ${CATEGORY_COLORS[cat]}`} style={{ width: `${(total / spent) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* List + form */}
      <div className="lg:col-span-2 lg:order-1 space-y-4">
        {draft ? (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800 dark:text-white">{editingId ? t('expenses.edit') : t('expenses.add')}</h3>
              <button onClick={() => { setDraft(null); setEditingId(null); setError(''); }} aria-label={t('common.cancel')}
                className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <input type="number" min={0} step="any" inputMode="decimal" autoFocus value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })} placeholder={t('expenses.amount')}
                className={`${inputClass} col-span-1`} />
              <select value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })} className={inputClass}>
                {[...new Set([draft.currency, ...CURRENCIES])].map((c) => <option key={c}>{c}</option>)}
              </select>
              <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as ExpenseCategory })}
                className={`${inputClass} col-span-2 sm:col-span-2`}>
                {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{t(`expenses.categories.${c}`)}</option>)}
              </select>
            </div>
            <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder={t('expenses.description')} className={inputClass} />
            <div className="grid grid-cols-2 gap-3">
              <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className={inputClass} />
              <select value={draft.location_id} onChange={(e) => setDraft({ ...draft, location_id: e.target.value })} className={inputClass}>
                <option value="">{t('expenses.noLocation')}</option>
                {trip.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button onClick={save} disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-sm font-medium rounded-xl">
              {saving && <Loader2 size={15} className="animate-spin" />} {t('common.save')}
            </button>
          </div>
        ) : (
          <button onClick={() => setDraft(emptyDraft())}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-sm">
            <Plus size={16} /> {t('expenses.add')}
          </button>
        )}

        {isLoading ? (
          <Loader2 className="animate-spin text-primary-500" />
        ) : expenses.length === 0 ? (
          <p className="text-sm text-slate-400 italic py-6">{t('expenses.empty')}</p>
        ) : (
          <ul className="bg-white dark:bg-slate-800 rounded-2xl shadow-card divide-y divide-slate-100 dark:divide-slate-700">
            {expenses.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-3 group">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${CATEGORY_COLORS[e.category]}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-white truncate">
                    {e.description || t(`expenses.categories.${e.category}`)}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {[e.date && format(parseISO(e.date), 'PP', { locale: dateLocale }), t(`expenses.categories.${e.category}`),
                      locationName(e.location_id)].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span className="text-sm font-semibold text-slate-800 dark:text-white shrink-0">{money(e.amount, e.currency)}</span>
                <button onClick={() => startEdit(e)} aria-label={t('expenses.edit')}
                  className="text-slate-400 hover:text-primary-600 sm:opacity-0 group-hover:opacity-100"><Pencil size={14} /></button>
                <button onClick={() => remove(e)} aria-label={t('expenses.delete')}
                  className="text-slate-400 hover:text-red-500 sm:opacity-0 group-hover:opacity-100"><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
