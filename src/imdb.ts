import AsyncStorage from '@react-native-async-storage/async-storage';
import { IMDB_DATA } from './imdbData';
import * as config from './config';

// IMDb ratings: the bundled list (scripts/imdb-ratings.mjs) answers instantly and offline.
// Only movies missing from it, or recent ones whose rating still moves, are looked up live —
// via OMDb when an OMDB_KEY is configured, otherwise Stremio's free Cinemeta service — and
// those answers are remembered on the device for a long time.

const REC = 10; // 8-digit id + 2-digit rating
const OMDB_KEY: string | undefined = (config as any).OMDB_KEY || undefined;

// Binary search in the sorted fixed-width string: no parsing, no extra memory.
function bundled(imdbId: string): number | null {
  const n = Number(imdbId.slice(2));
  if (!n) return null;
  let lo = 0;
  let hi = IMDB_DATA.length / REC - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const id = Number(IMDB_DATA.substr(mid * REC, 8));
    if (id === n) return Number(IMDB_DATA.substr(mid * REC + 8, 2)) / 10;
    if (id < n) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}

// Live answers, persisted. `r` null = IMDb had no rating yet (also worth remembering).
type Live = { r: number | null; at: number };
const STORE = 'filmavond.imdb.v1';
const DAY = 864e5;
const live = new Map<string, Live>();
let hydrated: Promise<void> | null = null;
const hydrate = () => (hydrated ??= AsyncStorage.getItem(STORE).then((raw) => {
  if (raw) for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, Live>)) live.set(k, v);
}).catch(() => {}));

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const entries = [...live.entries()].sort((a, b) => b[1].at - a[1].at).slice(0, 3000);
    AsyncStorage.setItem(STORE, JSON.stringify(Object.fromEntries(entries))).catch(() => {});
  }, 2000);
}

// New releases gain votes fast, so their rating is refreshed now and then; older ratings
// barely move, so the bundled value (or a live answer) is kept for half a year.
function maxAge(releaseDate: string | null): number {
  const age = releaseDate ? Date.now() - Date.parse(releaseDate) : Infinity;
  if (age < 60 * DAY) return 3 * DAY;
  if (age < 365 * DAY) return 14 * DAY;
  return 180 * DAY;
}
const isRecent = (releaseDate: string | null) => maxAge(releaseDate) < 180 * DAY;

async function fetchJson(url: string): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000); // never hold up the movie details
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLive(imdbId: string): Promise<number | null> {
  if (OMDB_KEY) {
    const d = await fetchJson(`https://www.omdbapi.com/?i=${imdbId}&apikey=${OMDB_KEY}`);
    if (d.Response === 'False') {
      if (/limit/i.test(d.Error ?? '')) throw new Error(d.Error); // over quota: retry later
      return null;
    }
    const r = parseFloat(d.imdbRating);
    return isNaN(r) ? null : r;
  }
  const d = await fetchJson(`https://v3-cinemeta.strem.io/meta/movie/${imdbId}.json`);
  const r = parseFloat(d?.meta?.imdbRating);
  return isNaN(r) ? null : r;
}

const inFlight = new Map<string, Promise<number | null>>();

// The IMDb rating for a movie, or null when IMDb has none (callers fall back to TMDB).
export async function imdbRating(imdbId: string | null | undefined, releaseDate: string | null): Promise<number | null> {
  if (!imdbId) return null;
  await hydrate();
  const cached = live.get(imdbId);
  if (cached && Date.now() - cached.at < maxAge(releaseDate)) return cached.r;
  const fromBundle = bundled(imdbId);
  if (fromBundle != null && !isRecent(releaseDate)) return fromBundle;

  let p = inFlight.get(imdbId);
  if (!p) {
    p = fetchLive(imdbId).then((r) => {
      live.set(imdbId, { r, at: Date.now() });
      scheduleSave();
      return r;
    }).catch(() => cached?.r ?? fromBundle) // offline / quota: best value we have
      .finally(() => inFlight.delete(imdbId));
    inFlight.set(imdbId, p);
  }
  return p;
}
