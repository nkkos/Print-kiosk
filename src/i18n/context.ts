import { createContext } from 'react';
import type { Language } from './types';

// Deliberate, narrow exception to the project's "no Context" rule (see
// CLAUDE.md, Architecture) — translated text is needed for read access by
// nearly every screen and several shared components, unlike every other
// piece of cross-screen state so far. Ownership of the actual `language`
// value still lives in App.tsx, same as every other cross-screen concern;
// this Context is a controlled pass-through for *reading* it without
// prop-drilling a `t` object through every layer. *Changing* the language
// stays an ordinary callback prop (`onLanguageChange`), same pattern as
// onLogin/onGoToPersonalAccount — see docs/i18n-requirements.md.
export const LanguageContext = createContext<Language>('en');
