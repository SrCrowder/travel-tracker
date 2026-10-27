import { useTranslation } from 'react-i18next';
import { es } from 'date-fns/locale';

/** Returns the date-fns Locale for the current UI language (undefined = English default). */
export function useDateLocale() {
  const { i18n } = useTranslation();
  return i18n.language === 'es' ? es : undefined;
}
