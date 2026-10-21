import { useEffect, useState } from 'react';
import Constants from 'expo-constants';

// This app's version, and whether the download page (coenvermeer.nl/movienight) has a newer one.
export const APP_VERSION: string = Constants.expoConfig?.version ?? '0.0.0';
export const VERSION_CODE: number = Constants.expoConfig?.android?.versionCode ?? 0;
export const DOWNLOAD_PAGE = 'https://coenvermeer.nl/movienight/';

export type Update = { version: string; versionCode: number };

// Checked once per app start (scripts/site.mjs publishes version.json next to the APK).
let pending: Promise<Update | null> | null = null;
function fetchLatest(): Promise<Update | null> {
  pending ??= (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetch(`${DOWNLOAD_PAGE}version.json`, { signal: ctrl.signal, headers: { 'cache-control': 'no-cache' } });
      if (!res.ok) return null;
      const d = await res.json();
      return typeof d.versionCode === 'number' && d.versionCode > VERSION_CODE ? { version: String(d.version), versionCode: d.versionCode } : null;
    } catch {
      return null; // offline: no banner
    } finally {
      clearTimeout(timer);
    }
  })();
  return pending;
}

export function useUpdate(): Update | null {
  const [update, setUpdate] = useState<Update | null>(null);
  useEffect(() => { fetchLatest().then(setUpdate); }, []);
  return update;
}
