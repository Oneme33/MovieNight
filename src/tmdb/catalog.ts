// Images, streaming services, genre filters and the search-result shape.
import { GENRES } from './http';

export const genreName = (id: number): string | null => GENRES[id] ?? null;

export const IMG = (path: string | null, size: 'w200' | 'w342' | 'w500' = 'w342') =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
export const LOGO = (path: string | null) =>
  path ? `https://image.tmdb.org/t/p/w92${path}` : null;

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

