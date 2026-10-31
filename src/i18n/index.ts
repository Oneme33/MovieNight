import { getLocales } from 'expo-localization';
import * as config from '../config';
import { nl } from './nl';
import { en } from './en';

export type UiLang = 'nl' | 'en';

// UI language: set UI_LANG in src/config.ts to 'nl' or 'en' to force one, or leave it
// 'auto' to follow the device (Dutch if the device is Dutch, otherwise English).
const configured = (config as any).UI_LANG as UiLang | 'auto' | undefined;
const deviceLang: UiLang = getLocales()[0]?.languageCode === 'nl' ? 'nl' : 'en';
export const uiLang: UiLang = configured === 'nl' || configured === 'en' ? configured : deviceLang;

// App name follows the same language (defaults to MovieNight on non-Dutch devices).
export const appName = uiLang === 'nl' ? 'Filmavond' : 'MovieNight';

const dict = { nl, en };
export const t = dict[uiLang];
