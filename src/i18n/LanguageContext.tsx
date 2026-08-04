import type { ReactNode } from 'react';
import { LanguageContext } from './context';
import type { Language } from './types';

interface LanguageProviderProps {
  language: Language;
  children: ReactNode;
}

export function LanguageProvider({ language, children }: LanguageProviderProps) {
  return <LanguageContext.Provider value={language}>{children}</LanguageContext.Provider>;
}
