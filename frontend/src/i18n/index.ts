import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import es from './locales/es.json';

// Read persisted language from Zustand's localStorage key (default: 'es')
const savedLang = (() => {
  try {
    const raw = localStorage.getItem('travel-tracker-prefs');
    return (JSON.parse(raw || '{}') as any)?.state?.language ?? 'es';
  } catch {
    return 'es';
  }
})();

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
  },
  lng: savedLang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
