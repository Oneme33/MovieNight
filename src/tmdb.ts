import AsyncStorage from '@react-native-async-storage/async-storage';
import { TMDB_TOKEN } from './config';
import { uiLang, t } from './i18n';
import type { TitleLang } from './ListContext';
import { imdbRating } from './imdb';

const BASE = 'https://api.themoviedb.org/3';

// Which TMDB language do we request? For 'original' we request English and use original_title.
const apiLang = (lang: TitleLang) => (lang === 'nl' ? 'nl-NL' : 'en-US');
const pickTitle = (lang: TitleLang, title: string, original: string) =>
  lang === 'original' ? original || title : title || original;
export const IMG = (path: string | null, size: 'w200' | 'w342' | 'w500' = 'w342') =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
export const LOGO = (path: string | null) =>
  path ? `https://image.tmdb.org/t/p/w92${path}` : null;

const headers = {
  Authorization: `Bearer ${TMDB_TOKEN}`,
  accept: 'application/json',
};

// Genre names in both UI languages; always shown in the UI language (never mixed).
const GENRES_NL: Record<number, string> = {
  28: 'Actie', 12: 'Avontuur', 16: 'Animatie', 35: 'Komedie', 80: 'Misdaad',
  99: 'Documentaire', 18: 'Drama', 10751: 'Familie', 14: 'Fantasy', 36: 'Historie',
  27: 'Horror', 10402: 'Muziek', 9648: 'Mysterie', 10749: 'Romantiek', 878: 'Sci-fi',
  10770: 'TV-film', 53: 'Thriller', 10752: 'Oorlog', 37: 'Western',
};
const GENRES_EN: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-fi',
  10770: 'TV movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
};
const GENRES = uiLang === 'nl' ? GENRES_NL : GENRES_EN;
export const genreName = (id: number): string | null => GENRES[id] ?? null;

// Your streaming services (with TMDB id + logo for NL). Videoland is NL-only.
// `watch` opens the service's search for a title (the app takes over when installed).
const enc = encodeURIComponent;
export const OUR_PROVIDERS = [
  { key: 'Netflix', id: 8, logo: '/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg', match: ['netflix'], watch: (q: string) => `https://www.netflix.com/search?q=${enc(q)}` },
  { key: 'Disney+', id: 337, logo: '/97yvRBw1GzX7fXprcF80er19ot.jpg', match: ['disney'], watch: (q: string) => `https://www.disneyplus.com/search?q=${enc(q)}` },
  { key: 'Prime Video', id: 119, logo: '/pvske1MyAoymrs5bguRfVqYiM9a.jpg', match: ['prime video', 'amazon prime'], watch: (q: string) => `https://www.primevideo.com/search?phrase=${enc(q)}` },
  { key: 'Max', id: 1899, logo: '/jbe4gVSfRlbPTdESXhEKpornsfu.jpg', match: ['hbo max', 'max'], watch: (q: string) => `https://play.max.com/search?q=${enc(q)}` },
  { key: 'Videoland', id: 72, logo: '/qN7uDYanT47WI0MmbwOr5HFFot.jpg', match: ['videoland'], watch: (q: string) => `https://www.videoland.com/search?query=${enc(q)}` },
  { key: 'Viaplay', id: 76, logo: '/bnoTnLzz2MAhK3Yc6P9KXe5drIz.jpg', match: ['viaplay'], watch: (q: string) => `https://viaplay.nl/search?query=${enc(q)}` },
  { key: 'SkyShowtime', id: 1773, logo: '/h0ZYcYHicKQ4Ixm5nOjqvwni5NG.jpg', match: ['skyshowtime'], watch: (q: string) => `https://www.skyshowtime.com/search?q=${enc(q)}` },
  { key: 'Apple TV+', id: 350, logo: '/mcbz1LgtErU9p4UdbZ0rG6RTWHX.jpg', match: ['apple tv'], watch: (q: string) => `https://tv.apple.com/search?term=${enc(q)}` },
];

// Genre options for the filters, in the UI language.
export const GENRE_OPTIONS: { id: number; name: string }[] =
  [28, 12, 16, 35, 80, 99, 18, 10751, 14, 27, 9648, 10749, 878, 53, 10752]
    .map((id) => ({ id, name: GENRES[id] }));

// Selected genres; `all` = a movie needs every genre, otherwise one of them is enough.
export type GenreFilter = { ids: number[]; all: boolean };
export const NO_GENRES: GenreFilter = { ids: [], all: false };
export function matchesGenres(genreIds: number[] | undefined, f: GenreFilter): boolean {
  if (!f.ids.length) return true;
  if (!genreIds?.length) return false;
  return f.all ? f.ids.every((id) => genreIds.includes(id)) : f.ids.some((id) => genreIds.includes(id));
}

export type Provider = { name: string; logo_path: string | null; key: string };

// Filter incoming NL flatrate providers down to your services (with logo).
export function filterOurProviders(
  flatrate: { provider_name: string; logo_path: string | null }[]
): Provider[] {
  const out: Provider[] = [];
  const seen = new Set<string>();
  for (const p of OUR_PROVIDERS) {
    const hit = flatrate.find((f) => p.match.some((m) => f.provider_name.toLowerCase().includes(m)));
    if (hit && !seen.has(p.key)) {
      seen.add(p.key);
      out.push({ key: p.key, name: hit.provider_name, logo_path: hit.logo_path });
    }
  }
  return out;
}

export type SearchResult = {
  tmdb_id: number;
  title: string;
  year: number | null;
  poster_path: string | null;
  genre: string | null;
  rating: number | null;
  runtime?: number | null;
  popularity?: number;
  certAge?: number | null;
  ours: Provider[];
  hasFlatrate?: boolean;
  providersLoaded: boolean;
  extrasLoaded?: boolean; // runtime/age/services looked up (or the lookup failed)
  nlRent?: string[];
};

// Unreleased movies are hidden everywhere — you can't watch them yet.
const today = () => new Date().toISOString().slice(0, 10);
const isReleased = (r: any) => !r.release_date || r.release_date <= today();

// In-memory cache: identical searches within a session don't hit the API again.
const searchCache = new Map<string, SearchResult[]>();

export async function searchMovies(query: string, lang: TitleLang = 'en'): Promise<SearchResult[]> {
  const key = `${lang}:${query.trim().toLowerCase()}`;
  const cached = searchCache.get(key);
  if (cached) return cached.map((r: SearchResult) => ({ ...r }));
  const url = `${BASE}/search/movie?query=${encodeURIComponent(query)}&language=${apiLang(lang)}&include_adult=false&page=1`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`TMDB search failed (${res.status})`);
  const data = await res.json();
  const results = (data.results ?? []).filter(isReleased).map((r: any): SearchResult => ({
    tmdb_id: r.id,
    title: pickTitle(lang, r.title, r.original_title),
    year: r.release_date ? Number(r.release_date.slice(0, 4)) : null,
    poster_path: r.poster_path ?? null,
    genre: r.genre_ids?.length ? GENRES[r.genre_ids[0]] ?? null : null,
    rating: null, // filled in (IMDb, else TMDB) once the movie's extras load
    ours: [],
    providersLoaded: false,
  }));
  searchCache.set(key, results);
  return results.map((r: SearchResult) => ({ ...r }));
}

export type DiscoverSort = 'popular' | 'rating' | 'year_desc' | 'year_asc' | 'length';
const SORT_PARAM: Record<DiscoverSort, string> = {
  popular: 'popularity.desc',
  rating: 'vote_average.desc',
  year_desc: 'primary_release_date.desc',
  year_asc: 'primary_release_date.asc',
  length: 'popularity.desc', // no server-side runtime sort; sorted client-side once runtimes load
};

export type DiscoverPage = { results: SearchResult[]; totalPages: number };
export type Length = 'all' | 'xshort' | 'short' | 'mid' | 'long';
export const LENGTH_OPTIONS: { key: Length; label: string }[] = [
  { key: 'all', label: t.lenAll },
  { key: 'xshort', label: t.lenXShort },
  { key: 'short', label: t.lenShort },
  { key: 'mid', label: t.lenMid },
  { key: 'long', label: t.lenLong },
];
export function matchesLength(rt: number, len: Length): boolean {
  if (len === 'xshort') return rt < 30;
  if (len === 'short') return rt < 60;
  if (len === 'mid') return rt >= 60 && rt <= 90;
  if (len === 'long') return rt >= 90;
  return true;
}
export type DiscoverOpts = {
  providerId?: number | null;
  streaming?: boolean; // true = on one of the selected services; false = everything
  streamingIds?: number[]; // the selected services (used when streaming=true)
  sort: DiscoverSort;
  lang?: TitleLang;
  page?: number;
  genres?: GenreFilter;
  length?: Length;
  kids?: boolean;
  yearFrom?: number | null;
  yearTo?: number | null;
};

const discoverCache = new Map<string, DiscoverPage>();

function runtimeParams(len?: Length): string {
  if (len === 'xshort') return '&with_runtime.gte=1&with_runtime.lte=29';
  if (len === 'short') return '&with_runtime.lte=59';
  if (len === 'mid') return '&with_runtime.gte=60&with_runtime.lte=90';
  if (len === 'long') return '&with_runtime.gte=90';
  return '';
}

// Browse movies: everything, any NL subscription service, or one service — with filters.
export async function discover(o: DiscoverOpts): Promise<DiscoverPage> {
  const { providerId = null, streaming = false, streamingIds = [], sort, lang = 'en', page = 1, genres = NO_GENRES, length = 'all', kids = false, yearFrom = null, yearTo = null } = o;
  const cacheKey = `${providerId}:${streaming}:${streamingIds.join('.')}:${sort}:${lang}:${page}:${genres.ids.join('.')}${genres.all ? '&' : '|'}:${length}:${kids}:${yearFrom}:${yearTo}`;
  const hit = discoverCache.get(cacheKey);
  if (hit) return { results: hit.results.map((r: SearchResult) => ({ ...r })), totalPages: hit.totalPages };
  const prov = providerId ? OUR_PROVIDERS.find((p) => p.id === providerId) : undefined;
  const ours: Provider[] = prov ? [{ key: prov.key, name: prov.key, logo_path: prov.logo }] : [];
  let url = `${BASE}/discover/movie?language=${apiLang(lang)}&watch_region=NL`
    + `&include_adult=false&primary_release_date.lte=${yearTo && `${yearTo}-12-31` < today() ? `${yearTo}-12-31` : today()}`
    + `&sort_by=${SORT_PARAM[sort]}&page=${page}`;
  if (providerId || streaming) url += '&with_watch_monetization_types=flatrate';
  if (providerId) url += `&with_watch_providers=${providerId}`;
  else if (streaming && streamingIds.length) url += `&with_watch_providers=${streamingIds.join('|')}`;
  if (yearFrom) url += `&primary_release_date.gte=${yearFrom}-01-01`;
  // TMDB: comma = all genres, pipe = any of them.
  if (genres.ids.length) url += `&with_genres=${genres.ids.join(genres.all ? ',' : '|')}`;
  url += runtimeParams(length);
  if (kids) url += '&certification_country=NL&certification.lte=9';
  if (sort === 'rating') url += '&vote_count.gte=100';
  else if (yearFrom || yearTo) url += '&vote_count.gte=50'; // keeps obscure titles from topping year ranges
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`TMDB discover failed (${res.status})`);
  const data = await res.json();
  const results = (data.results ?? []).map((r: any): SearchResult => ({
    tmdb_id: r.id,
    title: pickTitle(lang, r.title, r.original_title),
    year: r.release_date ? Number(r.release_date.slice(0, 4)) : null,
    poster_path: r.poster_path ?? null,
    genre: r.genre_ids?.length ? GENRES[r.genre_ids[0]] ?? null : null,
    rating: null, // filled in (IMDb, else TMDB) once the movie's extras load
    ours,
    providersLoaded: !!providerId,
  }));
  const out = { results, totalPages: Math.min(data.total_pages ?? 1, 500) };
  discoverCache.set(cacheKey, out);
  return { results: out.results.map((r: SearchResult) => ({ ...r })), totalPages: out.totalPages };
}

// Movies that just came out digitally in the US (streaming / rent). They usually reach
// Dutch services and stores like Pathé Thuis a little later.
const usNewCache = new Map<string, DiscoverPage>();
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

export async function usNewPage(lang: TitleLang, page: number): Promise<DiscoverPage> {
  const key = `${lang}:${page}`;
  const hit = usNewCache.get(key);
  if (hit) return hit;
  const url = `${BASE}/discover/movie?language=${apiLang(lang)}&include_adult=false`
    + `&region=US&with_release_type=4&release_date.gte=${daysAgo(45)}&release_date.lte=${today()}`
    + `&sort_by=popularity.desc&vote_count.gte=20&page=${page}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`TMDB discover failed (${res.status})`);
  const data = await res.json();
  const out: DiscoverPage = {
    results: (data.results ?? []).map((r: any): SearchResult => ({
      tmdb_id: r.id,
      title: pickTitle(lang, r.title, r.original_title),
      year: r.release_date ? Number(r.release_date.slice(0, 4)) : null,
      poster_path: r.poster_path ?? null,
      genre: r.genre_ids?.length ? GENRES[r.genre_ids[0]] ?? null : null,
      rating: null, // filled in (IMDb, else TMDB) once the movie's extras load
      popularity: typeof r.popularity === 'number' ? r.popularity : 0,
      ours: [],
      providersLoaded: false,
    })),
    totalPages: Math.min(data.total_pages ?? 1, 500),
  };
  usNewCache.set(key, out);
  return out;
}

export async function usNewOnDigital(lang: TitleLang = 'en'): Promise<SearchResult[]> {
  const pages = await Promise.all([1, 2].map((p) => usNewPage(lang, p)));
  const seen = new Set<number>();
  return pages.flatMap((p) => p.results).filter((r) => !seen.has(r.tmdb_id) && !!seen.add(r.tmdb_id));
}

// Recommendations based on one movie (TMDB "recommendations"), cached per session.
const recsCache = new Map<string, SearchResult[]>();

export async function recommendationsFor(tmdbId: number, lang: TitleLang = 'en', page = 1): Promise<SearchResult[]> {
  const key = `${tmdbId}:${lang}:${page}`;
  const hit = recsCache.get(key);
  if (hit) return hit;
  try {
    const url = `${BASE}/movie/${tmdbId}/recommendations?language=${apiLang(lang)}&page=${page}`;
    const res = await fetch(url, { headers });
    if (!res.ok) return [];
    const data = await res.json();
    const results = (data.results ?? []).filter(isReleased).map((r: any): SearchResult => ({
      tmdb_id: r.id,
      title: pickTitle(lang, r.title, r.original_title),
      year: r.release_date ? Number(r.release_date.slice(0, 4)) : null,
      poster_path: r.poster_path ?? null,
      genre: r.genre_ids?.length ? GENRES[r.genre_ids[0]] ?? null : null,
      rating: null, // filled in (IMDb, else TMDB) once the movie's extras load
      popularity: typeof r.popularity === 'number' ? r.popularity : 0,
      ours: [],
      providersLoaded: false,
    }));
    recsCache.set(key, results);
    return results;
  } catch {
    return [];
  }
}

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
