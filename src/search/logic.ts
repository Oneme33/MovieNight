import { Ionicons } from '@expo/vector-icons';
import { t } from '../i18n';
import { OUR_PROVIDERS, SearchResult, DiscoverSort, Length, matchesLength, GenreFilter, NO_GENRES } from '../tmdb';

// Pure search/browse logic, kept out of the components so it stays testable.

export const SORTS: { key: DiscoverSort; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'popular', label: t.sortPopular, icon: 'flame' },
  { key: 'rating', label: t.sortRating, icon: 'star' },
  { key: 'year_desc', label: t.jaarDown, icon: 'arrow-down' },
  { key: 'year_asc', label: t.jaarUp, icon: 'arrow-up' },
  { key: 'length', label: t.sortLength, icon: 'hourglass-outline' },
];

export type SearchFilters = {
  genres: GenreFilter; length: Length; kids: boolean;
  hideSeen: boolean; hideListed: boolean; yearFrom: number | null; yearTo: number | null;
};
export const DEFAULT_FILTERS: SearchFilters = {
  genres: NO_GENRES, length: 'all', kids: false, hideSeen: true, hideListed: true, yearFrom: null, yearTo: null,
};
// The "hide" switches are defaults, so they don't count as active filters.
export const filterCount = (f: SearchFilters) =>
  (f.genres.ids.length ? 1 : 0) + (f.length !== 'all' ? 1 : 0) + (f.kids ? 1 : 0) + (f.yearFrom || f.yearTo ? 1 : 0);

const provKey = (id: number | null) => (id ? OUR_PROVIDERS.find((p) => p.id === id)?.key : undefined);

// What's shown. Browsing: the server already filtered; drop what's seen/listed and — because
// TMDB's runtime filter is unreliable — anything whose real runtime doesn't match.
// Text search: the service chip and the sort apply client-side.
export function visibleResults(results: SearchResult[], o: {
  searching: boolean; f: SearchFilters; seenIds: Set<number>; listedIds: Set<number>;
  service: number | null; streamingOnly: boolean; services: string[]; sort: DiscoverSort;
}): SearchResult[] {
  let visible = results;
  if (!o.searching) {
    // Hidden until the real runtime is known, so wrong matches don't flash in and out.
    if (o.f.length !== 'all') visible = visible.filter((r) => r.runtime != null && matchesLength(r.runtime, o.f.length));
    if (o.f.hideSeen && o.seenIds.size) visible = visible.filter((r) => !o.seenIds.has(r.tmdb_id));
    if (o.f.hideListed && o.listedIds.size) visible = visible.filter((r) => !o.listedIds.has(r.tmdb_id));
    // Runtime isn't sortable server-side; sort the loaded page client-side.
    if (o.sort === 'length') visible = [...visible].sort((a, b) => (a.runtime ?? 9999) - (b.runtime ?? 9999));
    return visible;
  }
  const key = provKey(o.service);
  if (key) visible = visible.filter((r) => !r.providersLoaded || r.ours.some((p) => p.key === key));
  else if (o.streamingOnly) visible = visible.filter((r) => !r.providersLoaded || r.ours.some((p) => o.services.includes(p.key)));
  if (o.sort !== 'popular') {
    visible = [...visible].sort((a, b) =>
      o.sort === 'rating' ? (b.rating ?? -1) - (a.rating ?? -1)
        : o.sort === 'year_desc' ? (b.year ?? 0) - (a.year ?? 0)
          : o.sort === 'length' ? (a.runtime ?? 9999) - (b.runtime ?? 9999)
            : (a.year ?? 0) - (b.year ?? 0));
  }
  return visible;
}
