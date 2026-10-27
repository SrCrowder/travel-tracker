import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Language = 'es' | 'en';

interface AppStore {
  // ── Theme ──────────────────────────────────────────────────────────────────
  darkMode: boolean;
  toggleDarkMode: () => void;

  // ── Language ───────────────────────────────────────────────────────────────
  language: Language;
  setLanguage: (lang: Language) => void;

  // ── Search & Filters ───────────────────────────────────────────────────────
  searchQuery: string;
  setSearchQuery: (q: string) => void;

  selectedYear: number | null;
  setSelectedYear: (year: number | null) => void;

  selectedTags: string[];
  toggleTag: (tag: string) => void;
  clearFilters: () => void;

  // ── UI State ───────────────────────────────────────────────────────────────
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export const useStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // Theme
      darkMode: false,
      toggleDarkMode: () => {
        const next = !get().darkMode;
        set({ darkMode: next });
        if (next) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      },

      // Language (default: Spanish)
      language: 'es',
      setLanguage: (lang) => set({ language: lang }),

      // Filters
      searchQuery: '',
      setSearchQuery: (q) => set({ searchQuery: q }),

      selectedYear: null,
      setSelectedYear: (year) => set({ selectedYear: year }),

      selectedTags: [],
      toggleTag: (tag) =>
        set((state) => ({
          selectedTags: state.selectedTags.includes(tag)
            ? state.selectedTags.filter((t) => t !== tag)
            : [...state.selectedTags, tag],
        })),

      clearFilters: () =>
        set({ searchQuery: '', selectedYear: null, selectedTags: [] }),

      // UI
      sidebarOpen: false,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
    }),
    {
      name: 'travel-tracker-prefs',
      partialize: (state) => ({ darkMode: state.darkMode, language: state.language }),
    }
  )
);
