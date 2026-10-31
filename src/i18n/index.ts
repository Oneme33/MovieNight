import { getLocales } from 'expo-localization';
import * as config from '../config';
import { nl } from './nl';
import { en } from './en';

export type UiLang = 'nl' | 'en';
export type UiLangSetting = UiLang | 'auto';

const deviceLang: UiLang = getLocales()[0]?.languageCode === 'nl' ? 'nl' : 'en';
const configured = (config as any).UI_LANG as UiLangSetting | undefined;

// The build-time default (src/config.ts), used until the user picks a language in Settings.
export const defaultUiLangSetting: UiLangSetting =
  configured === 'nl' || configured === 'en' ? configured : 'auto';

const resolve = (setting: UiLangSetting): UiLang => (setting === 'auto' ? deviceLang : setting);

// Mutable exports: screens re-render after applyUiLangSetting, and live bindings give them
// the new values. `t` is a proxy so even already-imported modules read the current language.
export let uiLang: UiLang = resolve(defaultUiLangSetting);
export let appName = uiLang === 'nl' ? 'Filmavond' : 'MovieNight';

export function applyUiLangSetting(setting: UiLangSetting) {
  uiLang = resolve(setting);
  appName = uiLang === 'nl' ? 'Filmavond' : 'MovieNight';
}

const dict = { nl, en };
export const t: typeof nl = new Proxy({} as typeof nl, {
  get: (_target, key) => (dict[uiLang] as any)[key],
});
