// Per-movie details ("extras"): IMDb/TMDB rating, NL services, runtime, genres, trailer, age.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TitleLang } from '../ListContext';
import { imdbRating } from '../imdb';
import { BASE, apiLang, pickTitle, headers } from './http';
import { Provider, filterOurProviders, genreName } from './catalog';

export type MovieExtras = {
  rating: number | null; // IMDb when known, otherwise TMDB
  ratingSource: 'imdb' | 'tmdb' | null;
  ours: Provider[];
  hasFlatrate: boolean; // streamable anywhere in NL (any subscription service)
  title: string | null;
  runtime: number | null;
  overview: string;
  genres: string[];
  genreIds: number[];
  certAge: number | null; // minimum age from NL (Kijkwijzer) or US certification
  trailerKey: string | null; // YouTube video key
  nlRent: string[]; // NL rent/buy stores (e.g. Pathé Thuis)
};

const EMPTY_EXTRAS: MovieExtras = {
  rating: null, ratingSource: null, ours: [], hasFlatrate: false, title: null, runtime: null, overview: '', genres: [],
  genreIds: [], certAge: null, trailerKey: null, nlRent: [],
};

function parseCertAge(data: any): number | null {
  const results = data.release_dates?.results ?? [];
  const certOf = (iso: string) =>
    results.find((r: any) => r.iso_3166_1 === iso)?.release_dates?.find((d: any) => d.certification)?.certification;
  const nl = certOf('NL');
  if (nl) {
    if (nl.toUpperCase() === 'AL') return 0;
    const n = parseInt(nl, 10);
    if (!isNaN(n)) return n;
  }
  const us = certOf('US');
  if (us) {
    const map: Record<string, number> = { G: 0, PG: 6, 'PG-13': 12, R: 16, 'NC-17': 18 };
    if (us in map) return map[us];
  }
  return null;
}

// Rating, NL services, runtime, overview, genres and trailer in one cached call.
// Cached in memory, deduplicated while in flight, throttled, and persisted on the
// device so a cold start doesn't have to refetch the whole list.
const extrasCache = new Map<string, { at: number; ex: MovieExtras }>();
const extrasInFlight = new Map<string, Promise<MovieExtras>>();
const EXTRAS_STORE = 'filmavond.extras.v3'; // v3: IMDb ratings
const EXTRAS_MAX_AGE = 3 * 24 * 3600 * 1000; // streaming availability changes; refresh after 3 days
const EXTRAS_MAX_ENTRIES = 500;
const MAX_CONCURRENT = 6;

let hydrated: Promise<void> | null = null;
function hydrateExtras(): Promise<void> {
  if (!hydrated) {
    hydrated = AsyncStorage.getItem(EXTRAS_STORE).then((raw) => {
      if (!raw) return;
      const now = Date.now();
      for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, { at: number; ex: MovieExtras }>)) {
        if (now - v.at < EXTRAS_MAX_AGE && !extrasCache.has(k)) extrasCache.set(k, v);
      }
    }).catch(() => {});
  }
  return hydrated;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const entries = [...extrasCache.entries()].sort((a, b) => b[1].at - a[1].at).slice(0, EXTRAS_MAX_ENTRIES);
    AsyncStorage.setItem(EXTRAS_STORE, JSON.stringify(Object.fromEntries(entries))).catch(() => {});
  }, 2000);
}

let active = 0;
const queue: (() => void)[] = [];
async function throttled<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => queue.push(resolve));
  else active++;
  try { return await fn(); } finally {
    const next = queue.shift();
    if (next) next(); // hand the slot straight to the next waiter
    else active--;
  }
}

export const extrasFailed = (ex: MovieExtras) => ex === EMPTY_EXTRAS;

export async function getMovieExtras(tmdbId: number, lang: TitleLang = 'en'): Promise<MovieExtras> {
  const key = `${tmdbId}:${lang}`;
  await hydrateExtras();
  const hit = extrasCache.get(key);
  if (hit) return hit.ex;
  const pending = extrasInFlight.get(key);
  if (pending) return pending;
  const p = throttled(() => fetchExtras(tmdbId, lang)).then((ex) => {
    if (ex !== EMPTY_EXTRAS) {
      extrasCache.set(key, { at: Date.now(), ex });
      scheduleSave();
    }
    return ex;
  }).finally(() => extrasInFlight.delete(key));
  extrasInFlight.set(key, p);
  return p;
}

// Extras for many movies at once (throttled); failed lookups are left out.
export async function getExtrasMany(ids: number[], lang: TitleLang): Promise<Record<number, MovieExtras>> {
  const out: Record<number, MovieExtras> = {};
  await Promise.all([...new Set(ids)].map(async (id) => {
    const ex = await getMovieExtras(id, lang);
    if (!extrasFailed(ex)) out[id] = ex;
  }));
  return out;
}

// Loads extras for many movies and reports them in batches (not one re-render per movie).
// Failed lookups are left out, so a later call can retry them.
export function loadExtrasBatched(
  ids: number[],
  lang: TitleLang,
  onBatch: (batch: Record<number, MovieExtras>) => void,
  onFail?: (id: number) => void,
): () => void {
  let pending: Record<number, MovieExtras> = {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;
  const flush = () => {
    timer = null;
    if (cancelled) return;
    const batch = pending;
    pending = {};
    if (Object.keys(batch).length) onBatch(batch);
  };
  [...new Set(ids)].forEach((id) => {
    getMovieExtras(id, lang).then((ex) => {
      if (cancelled) return;
      if (extrasFailed(ex)) { onFail?.(id); return; }
      pending[id] = ex;
      if (!timer) timer = setTimeout(flush, 200);
    });
  });
  return () => { cancelled = true; if (timer) clearTimeout(timer); };
}

async function fetchExtras(tmdbId: number, lang: TitleLang): Promise<MovieExtras> {
  try {
    const url = `${BASE}/movie/${tmdbId}?language=${apiLang(lang)}`
      + `&append_to_response=watch/providers,videos,release_dates&include_video_language=en,nl,null`;
    const res = await fetch(url, { headers });
    if (!res.ok) return EMPTY_EXTRAS;
    const data = await res.json();
    const nlProv = data['watch/providers']?.results?.NL ?? {};
    const flat = nlProv.flatrate ?? [];
    const nlRent = [...new Set<string>([...(nlProv.rent ?? []), ...(nlProv.buy ?? [])].map((p: any) => p.provider_name))];
    const vids = data.videos?.results ?? [];
    const trailer =
      vids.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer') ??
      vids.find((v: any) => v.site === 'YouTube');
    const ids: number[] = (data.genres ?? []).map((g: any) => g.id);
    const imdb = await imdbRating(data.imdb_id, data.release_date || null);
    const tmdb = typeof data.vote_average === 'number' && data.vote_average > 0 ? data.vote_average : null;
    const extras: MovieExtras = {
      rating: imdb ?? tmdb,
      ratingSource: imdb != null ? 'imdb' : tmdb != null ? 'tmdb' : null,
      ours: filterOurProviders(flat),
      hasFlatrate: flat.length > 0,
      title: pickTitle(lang, data.title, data.original_title),
      runtime: typeof data.runtime === 'number' && data.runtime > 0 ? data.runtime : null,
      overview: data.overview ?? '',
      genres: ids.map((id) => genreName(id)).filter(Boolean) as string[],
      genreIds: ids,
      certAge: parseCertAge(data),
      trailerKey: trailer?.key ?? null,
      nlRent,
    };
    return extras;
  } catch {
    return EMPTY_EXTRAS;
  }
}
