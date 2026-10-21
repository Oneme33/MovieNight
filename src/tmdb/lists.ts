// Searching and browsing: text search, discover (with filters), US digital releases, recommendations.
import { t } from '../i18n';
import type { TitleLang } from '../ListContext';
import { BASE, apiLang, pickTitle, headers, GENRES, today, isReleased } from './http';
import { OUR_PROVIDERS, Provider, SearchResult, GenreFilter, NO_GENRES } from './catalog';

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
