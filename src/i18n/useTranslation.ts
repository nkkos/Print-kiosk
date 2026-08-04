import { useContext } from 'react';
import { LanguageContext } from './context';
import { TRANSLATIONS } from './translations';

// Returns the full translations object for the current language — call
// sites read plain object paths (`t.welcome.print`, `t.cart.total(amount)`),
// no dot-path string parsing, full TypeScript autocomplete/typo-checking.
export function useTranslation() {
  const language = useContext(LanguageContext);
  return TRANSLATIONS[language];
}
