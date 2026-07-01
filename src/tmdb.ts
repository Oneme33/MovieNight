import { TMDB_TOKEN } from './config';
import type { TitleLang } from './ListContext';

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

const GENRES: Record<number, string> = {
  28: 'Actie', 12: 'Avontuur', 16: 'Animatie', 35: 'Komedie', 80: 'Misdaad',
  99: 'Documentaire', 18: 'Drama', 10751: 'Familie', 14: 'Fantasy', 36: 'Historie',
  27: 'Horror', 10402: 'Muziek', 9648: 'Mysterie', 10749: 'Romantiek', 878: 'Sci-fi',
  10770: 'TV-film', 53: 'Thriller', 10752: 'Oorlog', 37: 'Western',
};

// Your streaming services (with TMDB id + logo for NL).
export const OUR_PROVIDERS = [
  { key: 'Netflix', id: 8, logo: '/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg', match: ['netflix'] },
  { key: 'Videoland', id: 72, logo: '/qN7uDYanT47WI0MmbwOr5HFFot.jpg', match: ['videoland'] },
  { key: 'Disney+', id: 337, logo: '/97yvRBw1GzX7fXprcF80er19ot.jpg', match: ['disney'] },
  { key: 'Prime Video', id: 119, logo: '/pvske1MyAoymrs5bguRfVqYiM9a.jpg', match: ['prime video', 'amazon prime'] },
  { key: 'Max', id: 1899, logo: '/jbe4gVSfRlbPTdESXhEKpornsfu.jpg', match: ['hbo max', 'max'] },
];

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
  ours: Provider[];
  providersLoaded: boolean;
};

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
  const results = (data.results ?? []).map((r: any): SearchResult => ({
    tmdb_id: r.id,
    title: pickTitle(lang, r.title, r.original_title),
    year: r.release_date ? Number(r.release_date.slice(0, 4)) : null,
    poster_path: r.poster_path ?? null,
    genre: r.genre_ids?.length ? GENRES[r.genre_ids[0]] ?? null : null,
    rating: typeof r.vote_average === 'number' && r.vote_average > 0 ? r.vote_average : null,
    ours: [],
    providersLoaded: false,
  }));
  searchCache.set(key, results);
  return results.map((r: SearchResult) => ({ ...r }));
}

export type DiscoverSort = 'popular' | 'rating' | 'year_desc' | 'year_asc';
const SORT_PARAM: Record<DiscoverSort, string> = {
  popular: 'popularity.desc',
  rating: 'vote_average.desc',
  year_desc: 'primary_release_date.desc',
  year_asc: 'primary_release_date.asc',
};

export type DiscoverPage = { results: SearchResult[]; totalPages: number };

const discoverCache = new Map<string, DiscoverPage>();

// Browse movies available on a given service (subscription, NL), sorted + paginated.
export async function discoverByProvider(
  providerId: number,
  sort: DiscoverSort,
  lang: TitleLang = 'en',
  page = 1
): Promise<DiscoverPage> {
  const cacheKey = `${providerId}:${sort}:${lang}:${page}`;
  const hit = discoverCache.get(cacheKey);
  if (hit) return { results: hit.results.map((r: SearchResult) => ({ ...r })), totalPages: hit.totalPages };
  const prov = OUR_PROVIDERS.find((p) => p.id === providerId);
  const ours: Provider[] = prov ? [{ key: prov.key, name: prov.key, logo_path: prov.logo }] : [];
  const extra = sort === 'rating' ? '&vote_count.gte=100' : '';
  const url = `${BASE}/discover/movie?language=${apiLang(lang)}&watch_region=NL`
    + `&with_watch_providers=${providerId}&with_watch_monetization_types=flatrate`
    + `&sort_by=${SORT_PARAM[sort]}${extra}&page=${page}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`TMDB discover failed (${res.status})`);
  const data = await res.json();
  const results = (data.results ?? []).map((r: any): SearchResult => ({
    tmdb_id: r.id,
    title: pickTitle(lang, r.title, r.original_title),
    year: r.release_date ? Number(r.release_date.slice(0, 4)) : null,
    poster_path: r.poster_path ?? null,
    genre: r.genre_ids?.length ? GENRES[r.genre_ids[0]] ?? null : null,
    rating: typeof r.vote_average === 'number' && r.vote_average > 0 ? r.vote_average : null,
    ours,
    providersLoaded: true,
  }));
  const out = { results, totalPages: Math.min(data.total_pages ?? 1, 500) };
  discoverCache.set(cacheKey, out);
  return { results: out.results.map((r: SearchResult) => ({ ...r })), totalPages: out.totalPages };
}

export type MovieExtras = { rating: number | null; ours: Provider[]; title: string | null };

// Rating + NL subscription services + title (in the chosen language) in one call.
const extrasCache = new Map<string, MovieExtras>();

export async function getMovieExtras(tmdbId: number, lang: TitleLang = 'en'): Promise<MovieExtras> {
  const key = `${tmdbId}:${lang}`;
  if (extrasCache.has(key)) return extrasCache.get(key)!;
  try {
    const url = `${BASE}/movie/${tmdbId}?language=${apiLang(lang)}&append_to_response=watch/providers`;
    const res = await fetch(url, { headers });
    if (!res.ok) return { rating: null, ours: [], title: null };
    const data = await res.json();
    const flat = data['watch/providers']?.results?.NL?.flatrate ?? [];
    const extras: MovieExtras = {
      rating: typeof data.vote_average === 'number' && data.vote_average > 0 ? data.vote_average : null,
      ours: filterOurProviders(flat),
      title: pickTitle(lang, data.title, data.original_title),
    };
    extrasCache.set(key, extras);
    return extras;
  } catch {
    return { rating: null, ours: [], title: null };
  }
}
