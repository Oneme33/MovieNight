import { Ionicons } from '@expo/vector-icons';
import { t } from '../i18n';
import { theme } from '../theme';
import { SearchResult, MovieExtras } from '../tmdb';

// Pure "For you" logic: scoring recommendations and the themed rows built from them.

export type Rec = SearchResult & { score: number };

export const MAX_SEEDS = 12;
export const MAX_RESULTS = 50;
export const ROW_SIZE = 12;
export const DISMISSED_KEY = 'filmavond.dismissedRecs';
export const US_NEW_KEY = 'filmavond.usNew';

export const withExtras = (x: Rec, ex: MovieExtras): Rec => ({
  ...x, ours: ex.ours, hasFlatrate: ex.hasFlatrate, rating: ex.rating ?? x.rating,
  runtime: ex.runtime, certAge: ex.certAge, nlRent: ex.nlRent, providersLoaded: true,
});

export type Status = { text: string; color: string } | null;
export type RowDef = {
  key: string; title: string; icon: keyof typeof Ionicons.glyphMap; hint?: string;
  pred: (r: Rec) => boolean; sort: (a: Rec, b: Rec) => number;
};

// Score: how often a movie is recommended across seeds (+ position & popularity as tiebreaker).
export function scoreLists(lists: SearchResult[][], skip: (id: number) => boolean): Rec[] {
  const scored = new Map<number, Rec>();
  lists.forEach((list) => {
    list.forEach((r, i) => {
      if (skip(r.tmdb_id)) return;
      const bonus = 1000 + (20 - Math.min(i, 20)) * 10 + (r.popularity ?? 0) / 100;
      const cur = scored.get(r.tmdb_id);
      if (cur) cur.score += bonus;
      else scored.set(r.tmdb_id, { ...r, score: bonus });
    });
  });
  return [...scored.values()].sort((a, b) => b.score - a.score);
}

// Theme rows: a filter + sort over the scored recommendations (the "More" sheet reuses them).
export function rowDefinitions(recs: Rec[], services: string[]): RowDef[] {
  const byScore = (a: Rec, b: Rec) => b.score - a.score;
  const byRating = (a: Rec, b: Rec) => (b.rating ?? 0) - (a.rating ?? 0);
  const popMedian = [...recs].map((r) => r.popularity ?? 0).sort((a, b) => a - b)[Math.floor(recs.length / 2)] ?? 0;
  return [
    { key: 'tonight', title: t.themeTonight, icon: 'sparkles', pred: () => true, sort: byScore },
    { key: 'usNew', title: t.themeUsNew, icon: 'airplane-outline', hint: t.themeUsNewHint, pred: () => true, sort: () => 0 },
    { key: 'services', title: t.themeOnServices, icon: 'tv-outline', pred: (r) => r.ours.some((o) => services.includes(o.key)), sort: byScore },
    { key: 'short', title: t.themeShort, icon: 'hourglass-outline', pred: (r) => r.runtime != null && r.runtime <= 90, sort: byScore },
    { key: 'top', title: t.themeTop, icon: 'star-outline', pred: (r) => r.rating != null, sort: byRating },
    { key: 'kids', title: t.themeKids, icon: 'happy-outline', pred: (r) => r.certAge != null && r.certAge <= 9, sort: byScore },
    { key: 'gems', title: t.themeGems, icon: 'diamond-outline', pred: (r) => (r.rating ?? 0) >= 7 && (r.popularity ?? 0) <= popMedian, sort: byRating },
  ];
}

// "Just streaming in the US": on one of your services / for rent in NL / not in NL yet.
export function usStatus(r: Rec, services: string[]): Status {
  if (!r.providersLoaded) return null;
  const mine = r.ours.find((o) => services.includes(o.key));
  if (mine) return { text: t.usOnService(mine.key), color: theme.green };
  if (r.nlRent?.length) {
    return { text: t.usRentNL(r.nlRent.find((n) => n.startsWith('Path')) ?? r.nlRent[0]), color: theme.gold };
  }
  return { text: t.usNotNL, color: theme.textFaint };
}
