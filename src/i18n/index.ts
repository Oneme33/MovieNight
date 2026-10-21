import { getLocales } from 'expo-localization';
import { nl } from './nl';
import { en } from './en';

export type UiLang = 'nl' | 'en';

// Follows the system language: Dutch if the device is Dutch, otherwise English.
export const uiLang: UiLang = getLocales()[0]?.languageCode === 'nl' ? 'nl' : 'en';

// App name follows the same language (defaults to MovieNight on non-Dutch devices).
export const appName = uiLang === 'nl' ? 'Filmavond' : 'MovieNight';

const dict = { nl, en };
export const t = dict[uiLang];
