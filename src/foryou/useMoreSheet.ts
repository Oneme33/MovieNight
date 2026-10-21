import { useRef, useState } from 'react';
import { hTap } from '../haptics';
import type { TitleLang } from '../ListContext';
import { loadExtrasBatched, usNewPage, recommendationsFor, getExtrasMany } from '../tmdb';
import { Rec, RowDef, MAX_RESULTS, withExtras, scoreLists } from './logic';

// The candidate pool behind the rows; the rows only show its top, the "More" sheet digs deeper.
export type Pool = {
  pool: Rec[];                // scored recommendations from all seeds
  exclude: Set<number>;       // on the list or dismissed
  listIds: Set<number>;       // on the list
  seedIds: number[];          // the movies the recommendations are based on
  recPage: number;            // last TMDB recommendations page fetched per seed
};

// State and paging for the "More" sheet.
export function useMoreSheet(o: {
  titleLang: TitleLang; recs: Rec[]; usNew: Rec[]; poolRef: { current: Pool };
  getDismissed: () => Promise<Set<number>>;
}) {
  const [key, setKey] = useState<string | null>(null);
  const [items, setItems] = useState<Rec[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const cursor = useRef(0);
  const gen = useRef(0);

  const enrich = (list: Rec[]) => {
    loadExtrasBatched(list.filter((x) => !x.providersLoaded).map((x) => x.tmdb_id), o.titleLang, (batch) => {
      setItems((prev) => prev.map((x) => (batch[x.tmdb_id] ? withExtras(x, batch[x.tmdb_id]) : x)));
    });
  };

  const open = (def: RowDef) => {
    hTap();
    gen.current++;
    setKey(def.key);
    setDone(false);
    setBusy(false);
    if (def.key === 'usNew') {
      setItems(o.usNew);
      cursor.current = 3; // pages 1–2 are already in usNew
      enrich(o.usNew);
    } else {
      setItems(o.recs.filter(def.pred).sort(def.sort));
      cursor.current = Math.min(o.poolRef.current.pool.length, MAX_RESULTS);
    }
  };

  // Next page of recommendations for every seed, merged into the pool.
  const growPool = async (): Promise<boolean> => {
    const p = o.poolRef.current;
    if (p.recPage >= 10 || !p.seedIds.length) return false;
    const page = ++p.recPage;
    const lists = await Promise.all(p.seedIds.map((id) => recommendationsFor(id, o.titleLang, page)));
    const known = new Set(p.pool.map((r) => r.tmdb_id));
    const extra = scoreLists(lists, (id) => known.has(id) || p.exclude.has(id));
    p.pool = [...p.pool, ...extra];
    return extra.length > 0;
  };

  const loadMore = async (def: RowDef | undefined) => {
    if (!def || busy || done) return;
    const g = gen.current;
    setBusy(true);
    const dismissed = await o.getDismissed();
    const have = new Set(items.map((x) => x.tmdb_id));
    const fresh: Rec[] = [];
    let end = false;
    try {
      if (def.key === 'usNew') {
        for (let i = 0; i < 3 && fresh.length < 12 && !end; i++) {
          const page = cursor.current++;
          const d = await usNewPage(o.titleLang, page);
          if (page >= d.totalPages || !d.results.length) end = true;
          const cand = d.results.filter((r) =>
            !have.has(r.tmdb_id) && !o.poolRef.current.listIds.has(r.tmdb_id) && !dismissed.has(r.tmdb_id));
          const ex = await getExtrasMany(cand.map((r) => r.tmdb_id), o.titleLang);
          cand.forEach((r) => {
            have.add(r.tmdb_id);
            const rec: Rec = { ...r, score: 0 };
            fresh.push(ex[r.tmdb_id] ? withExtras(rec, ex[r.tmdb_id]) : rec);
          });
        }
      } else {
        for (let i = 0; i < 4 && fresh.length < 12; i++) {
          const pool = o.poolRef.current;
          if (cursor.current >= pool.pool.length && !(await growPool())) { end = true; break; }
          const chunk = o.poolRef.current.pool.slice(cursor.current, cursor.current + 30);
          cursor.current += chunk.length;
          const cand = chunk.filter((r) => !have.has(r.tmdb_id) && !dismissed.has(r.tmdb_id));
          const ex = await getExtrasMany(cand.map((r) => r.tmdb_id), o.titleLang);
          cand
            .map((r) => (ex[r.tmdb_id] ? withExtras(r, ex[r.tmdb_id]) : r))
            .filter(def.pred)
            .sort(def.sort)
            .forEach((r) => { have.add(r.tmdb_id); fresh.push(r); });
        }
      }
    } catch { end = true; }
    setBusy(false);
    if (g !== gen.current) return;
    setItems((prev) => [...prev, ...fresh]);
    if (end) setDone(true);
  };

  // Something was added / dismissed / marked seen: drop it from the sheet too.
  const remove = (id: number) => setItems((prev) => prev.filter((x) => x.tmdb_id !== id));

  return { key, items, busy, done, open, close: () => setKey(null), loadMore, remove };
}
