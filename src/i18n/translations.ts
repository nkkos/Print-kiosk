import { en } from './en';
import { sk } from './sk';
import { de } from './de';
import { ru } from './ru';
import { uk } from './uk';
import type { Language } from './types';
import type { Translations } from './en';

export const TRANSLATIONS: Record<Language, Translations> = { en, sk, de, ru, uk };

// Each language's own self-name, for the language-picker popup — a Slovak
// speaker recognizes "Slovenčina" regardless of which language the
// interface currently happens to be showing.
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  sk: 'Slovenčina',
  de: 'Deutsch',
  ru: 'Русский',
  uk: 'Українська',
};
