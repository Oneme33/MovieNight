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

// Your streaming services (with TMDB id + logo for NL). Videoland is NL-only.
export const OUR_PROVIDERS = [
  { key: 'Netflix', id: 8, logo: '/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg', match: ['netflix'] },
  { key: 'Disney+', id: 337, logo: '/97yvRBw1GzX7fXprcF80er19ot.jpg', match: ['disney'] },
  { key: 'Prime Video', id: 119, logo: '/pvske1MyAoymrs5bguRfVqYiM9a.jpg', match: ['prime video', 'amazon prime'] },
  { key: 'Max', id: 1899, logo: '/jbe4gVSfRlbPTdESXhEKpornsfu.jpg', match: ['hbo max', 'max'] },
  { key: 'Videoland', id: 72, logo: '/qN7uDYanT47WI0MmbwOr5HFFot.jpg', match: ['videoland'] },
  { key: 'Viaplay', id: 76, logo: '/bnoTnLzz2MAhK3Yc6P9KXe5drIz.jpg', match: ['viaplay'] },
  { key: 'SkyShowtime', id: 1773, logo: '/h0ZYcYHicKQ4Ixm5nOjqvwni5NG.jpg', match: ['skyshowtime'] },
  { key: 'Apple TV+', id: 350, logo: '/mcbz1LgtErU9p4UdbZ0rG6RTWHX.jpg', match: ['apple tv'] },
];

// Genre options (id → Dutch label) for the search filter.
export const GENRE_OPTIONS: { id: number; name: string }[] = [
  { id: 28, name: 'Actie' }, { id: 12, name: 'Avontuur' }, { id: 16, name: 'Animatie' },
  { id: 35, name: 'Komedie' }, { id: 80, name: 'Misdaad' }, { id: 99, name: 'Documentaire' },
  { id: 18, name: 'Drama' }, { id: 10751, name: 'Familie' }, { id: 14, name: 'Fantasy' },
  { id: 27, name: 'Horror' }, { id: 9648, name: 'Mysterie' }, { id: 10749, name: 'Romantiek' },
  { id: 878, name: 'Sci-fi' }, { id: 53, name: 'Thriller' }, { id: 10752, name: 'Oorlog' },
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
  runtime?: number | null;
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
export type Length = 'all' | 'short' | 'mid' | 'long';
export type DiscoverOpts = {
  providerId?: number | null;
  streaming?: boolean; // true = any NL subscription service; false = everything
  sort: DiscoverSort;
  lang?: TitleLang;
  page?: number;
  genre?: number | null;
  length?: Length;
  kids?: boolean;
};

const discoverCache = new Map<string, DiscoverPage>();

function runtimeParams(len?: Length): string {
  if (len === 'short') return '&with_runtime.lte=59';
  if (len === 'mid') return '&with_runtime.gte=60&with_runtime.lte=90';
  if (len === 'long') return '&with_runtime.gte=90';
  return '';
}

// Browse movies: everything, any NL subscription service, or one service — with filters.
export async function discover(o: DiscoverOpts): Promise<DiscoverPage> {
  const { providerId = null, streaming = false, sort, lang = 'en', page = 1, genre = null, length = 'all', kids = false } = o;
  const cacheKey = `${providerId}:${streaming}:${sort}:${lang}:${page}:${genre}:${length}:${kids}`;
  const hit = discoverCache.get(cacheKey);
  if (hit) return { results: hit.results.map((r: SearchResult) => ({ ...r })), totalPages: hit.totalPages };
  const prov = providerId ? OUR_PROVIDERS.find((p) => p.id === providerId) : undefined;
  const ours: Provider[] = prov ? [{ key: prov.key, name: prov.key, logo_path: prov.logo }] : [];
  let url = `${BASE}/discover/movie?language=${apiLang(lang)}&watch_region=NL`
    + `&include_adult=false`
    + `&sort_by=${SORT_PARAM[sort]}&page=${page}`;
  if (providerId || streaming) url += '&with_watch_monetization_types=flatrate';
  if (providerId) url += `&with_watch_providers=${providerId}`;
  if (genre) url += `&with_genres=${genre}`;
  url += runtimeParams(length);
  if (kids) url += '&certification_country=NL&certification.lte=9';
  if (sort === 'rating') url += '&vote_count.gte=100';
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
    providersLoaded: !!providerId,
  }));
  const out = { results, totalPages: Math.min(data.total_pages ?? 1, 500) };
  discoverCache.set(cacheKey, out);
  return { results: out.results.map((r: SearchResult) => ({ ...r })), totalPages: out.totalPages };
}

export type MovieExtras = {
  rating: number | null;
  ours: Provider[];
  title: string | null;
  runtime: number | null;
  overview: string;
  genres: string[];
  genreIds: number[];
  certAge: number | null; // minimum age from NL (Kijkwijzer) or US certification
  trailerKey: string | null; // YouTube video key
};

const EMPTY_EXTRAS: MovieExtras = {
  rating: null, ours: [], title: null, runtime: null, overview: '', genres: [],
  genreIds: [], certAge: null, trailerKey: null,
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
const extrasCache = new Map<string, MovieExtras>();

export async function getMovieExtras(tmdbId: number, lang: TitleLang = 'en'): Promise<MovieExtras> {
  const key = `${tmdbId}:${lang}`;
  if (extrasCache.has(key)) return extrasCache.get(key)!;
  try {
    const url = `${BASE}/movie/${tmdbId}?language=${apiLang(lang)}`
      + `&append_to_response=watch/providers,videos,release_dates&include_video_language=en,nl,null`;
    const res = await fetch(url, { headers });
    if (!res.ok) return EMPTY_EXTRAS;
    const data = await res.json();
    const flat = data['watch/providers']?.results?.NL?.flatrate ?? [];
    const vids = data.videos?.results ?? [];
    const trailer =
      vids.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer') ??
      vids.find((v: any) => v.site === 'YouTube');
    const extras: MovieExtras = {
      rating: typeof data.vote_average === 'number' && data.vote_average > 0 ? data.vote_average : null,
      ours: filterOurProviders(flat),
      title: pickTitle(lang, data.title, data.original_title),
      runtime: typeof data.runtime === 'number' && data.runtime > 0 ? data.runtime : null,
      overview: data.overview ?? '',
      genres: (data.genres ?? []).map((g: any) => g.name),
      genreIds: (data.genres ?? []).map((g: any) => g.id),
      certAge: parseCertAge(data),
      trailerKey: trailer?.key ?? null,
    };
    extrasCache.set(key, extras);
    return extras;
  } catch {
    return EMPTY_EXTRAS;
  }
}
