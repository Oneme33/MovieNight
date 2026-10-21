import { Ionicons } from '@expo/vector-icons';
import { t } from '../i18n';
import type { MovieRow } from '../supabase';
import { hypeOf } from '../db';
import { MovieExtras, Length, matchesLength, GenreFilter, NO_GENRES, matchesGenres } from '../tmdb';

// Pure watchlist logic (sorting + filtering), kept out of the components so it stays testable.

export type SortMode = 'nieuw' | 'waardering' | 'titel' | 'streaming' | 'lengte' | 'handmatig';
export const SORTS: { key: SortMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'nieuw', label: t.sortNewest, icon: 'time-outline' },
  { key: 'waardering', label: t.sortRating, icon: 'star-outline' },
  { key: 'titel', label: t.sortTitle, icon: 'text-outline' },
  { key: 'streaming', label: t.sortStreaming, icon: 'tv-outline' },
  { key: 'lengte', label: t.sortLength, icon: 'hourglass-outline' },
  { key: 'handmatig', label: t.sortManual, icon: 'reorder-three-outline' },
];

export type SeenSort = 'datum' | 'titel' | 'cijfer';
export const SEEN_SORTS: { key: SeenSort; label: string }[] = [
  { key: 'datum', label: t.seenDate },
  { key: 'titel', label: t.seenTitle },
  { key: 'cijfer', label: t.seenRating },
];

export type WatchFilters = { genres: GenreFilter; length: Length; kids: boolean; hype: boolean };
export const NO_FILTERS: WatchFilters = { genres: NO_GENRES, length: 'all', kids: false, hype: false };
export const filterCount = (f: WatchFilters) =>
  (f.genres.ids.length ? 1 : 0) + (f.length !== 'all' ? 1 : 0) + (f.kids ? 1 : 0) + (f.hype ? 1 : 0);

// Average of everyone's scores for a movie, -1 when nobody rated it.
export const avg = (r?: Record<string, number> | null) => {
  const v = Object.values(r ?? {});
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : -1;
};

type Extras = Record<number, MovieExtras>;
const exOf = (m: MovieRow, extras: Extras) => (m.tmdb_id ? extras[m.tmdb_id] : undefined);

// The "To watch" tab: filters combine as AND; while a filter is active, movies whose data
// isn't known yet are left out.
export function unseenList(
  movies: MovieRow[], extras: Extras, f: WatchFilters, sort: SortMode, titleOf: (m: MovieRow) => string,
): MovieRow[] {
  let arr = movies.filter((m) => !m.seen);
  if (f.hype) arr = arr.filter((m) => hypeOf(m).both);
  if (f.length !== 'all' || f.genres.ids.length || f.kids) {
    arr = arr.filter((m) => {
      const ex = exOf(m, extras);
      if (f.length !== 'all') {
        const rt = ex?.runtime;
        if (rt == null || !matchesLength(rt, f.length)) return false;
      }
      if (!matchesGenres(ex?.genreIds, f.genres)) return false;
      if (f.kids && !(ex?.certAge != null && ex.certAge <= 9)) return false;
      return true;
    });
  }
  const byTitle = (a: MovieRow, b: MovieRow) => titleOf(a).localeCompare(titleOf(b), 'nl');
  if (sort === 'nieuw') arr.sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
  else if (sort === 'waardering') {
    const r = (m: MovieRow) => exOf(m, extras)?.rating || -1;
    arr.sort((a, b) => r(b) - r(a));
  } else if (sort === 'titel') arr.sort(byTitle);
  else if (sort === 'streaming') {
    const svc = (m: MovieRow) => exOf(m, extras)?.ours[0]?.key || '~';
    arr.sort((a, b) => svc(a).localeCompare(svc(b)) || byTitle(a, b));
  } else if (sort === 'lengte') {
    const rt = (m: MovieRow) => exOf(m, extras)?.runtime || 9999;
    arr.sort((a, b) => rt(a) - rt(b));
  } else arr.sort((a, b) => a.position - b.position);
  return arr;
}

// The "Watched" tab.
export function seenList(movies: MovieRow[], sort: SeenSort, titleOf: (m: MovieRow) => string): MovieRow[] {
  const arr = movies.filter((m) => m.seen);
  if (sort === 'titel') arr.sort((a, b) => titleOf(a).localeCompare(titleOf(b), 'nl'));
  else if (sort === 'cijfer') arr.sort((a, b) => avg(b.ratings) - avg(a.ratings));
  else arr.sort((a, b) => ((b.seen_at ?? '') > (a.seen_at ?? '') ? 1 : -1));
  return arr;
}
