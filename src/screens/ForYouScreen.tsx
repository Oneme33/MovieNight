import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View, Text, FlatList, ScrollView, TouchableOpacity, StyleSheet, Image,
  RefreshControl, Modal, Pressable, ActivityIndicator, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { FadeIn } from 'react-native-reanimated';
import { hTap, hMedium } from '../haptics';
import { theme, radius } from '../theme';
import { Background } from '../Background';
import { t } from '../i18n';
import { useSession } from '../ListContext';
import { MovieRow } from '../supabase';
import { fetchMovies, addMovie } from '../db';
import {
  recommendationsFor, loadExtrasBatched, usNewOnDigital, usNewPage, getExtrasMany, IMG, SearchResult, MovieExtras,
} from '../tmdb';
import { MovieDetails, DetailTarget } from '../MovieDetails';
import { SkeletonRows } from '../Loader';

type Rec = SearchResult & { score: number };

const MAX_SEEDS = 12;
const MAX_RESULTS = 50;
const ROW_SIZE = 12;
const DISMISSED_KEY = 'filmavond.dismissedRecs';
const US_NEW_KEY = 'filmavond.usNew';

const withExtras = (x: Rec, ex: MovieExtras): Rec => ({
  ...x, ours: ex.ours, hasFlatrate: ex.hasFlatrate, rating: ex.rating ?? x.rating,
  runtime: ex.runtime, certAge: ex.certAge, nlRent: ex.nlRent, providersLoaded: true,
});

type Status = { text: string; color: string } | null;
type RowDef = {
  key: string; title: string; icon: keyof typeof Ionicons.glyphMap; hint?: string;
  pred: (r: Rec) => boolean; sort: (a: Rec, b: Rec) => number;
};

const GRID_W = Math.floor((Dimensions.get('window').width - 32 - 20) / 3);

// Score: how often a movie is recommended across seeds (+ position & popularity as tiebreaker).
function scoreLists(lists: SearchResult[][], skip: (id: number) => boolean): Rec[] {
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

function PosterCard({ item, isAdded, onPress, onAction, status, width = 112 }: {
  item: Rec; isAdded: boolean; onPress: () => void; onAction: () => void; status?: Status; width?: number;
}) {
  const poster = IMG(item.poster_path, 'w342');
  const size = { width, height: Math.round(width * 1.48) };
  return (
    <TouchableOpacity style={{ width }} onPress={onPress} onLongPress={onAction} delayLongPress={280} activeOpacity={0.85}>
      <View style={[pc.poster, size]}>
        {poster ? (
          <Image source={{ uri: poster }} style={size} />
        ) : (
          <View style={pc.posterEmpty}><Ionicons name="film-outline" size={28} color={theme.textFaint} /></View>
        )}
        {item.rating != null ? (
          <View style={pc.badge}>
            <Ionicons name="star" size={10} color={theme.gold} />
            <Text style={pc.badgeText}>{item.rating.toFixed(1)}</Text>
          </View>
        ) : null}
        <TouchableOpacity style={[pc.action, isAdded && pc.actionDone]} onPress={onAction}>
          <Ionicons name={isAdded ? 'checkmark' : 'ellipsis-horizontal'} size={16} color={isAdded ? theme.green : theme.red} />
        </TouchableOpacity>
      </View>
      <Text style={pc.title} numberOfLines={2}>{item.title}</Text>
      {status ? <Text style={[pc.status, { color: status.color }]} numberOfLines={1}>{status.text}</Text> : null}
    </TouchableOpacity>
  );
}

export default function ForYouScreen() {
  const { session, titleLang, services } = useSession();
  const dismissedRef = useRef<Set<number> | null>(null);

  const getDismissed = async (): Promise<Set<number>> => {
    if (dismissedRef.current) return dismissedRef.current;
    try {
      const raw = await AsyncStorage.getItem(DISMISSED_KEY);
      dismissedRef.current = new Set(raw ? JSON.parse(raw) : []);
    } catch { dismissedRef.current = new Set(); }
    return dismissedRef.current;
  };

  const [recs, setRecs] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [seedSig, setSeedSig] = useState('');
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [detailFor, setDetailFor] = useState<DetailTarget>(null);
  const [actionFor, setActionFor] = useState<Rec | null>(null);
  const [usNew, setUsNew] = useState<Rec[]>([]);
  const usNewLang = useRef<string | null>(null);

  // Full candidate pool behind the rows (the rows only show the top of it).
  const poolRef = useRef<Rec[]>([]);
  const excludeRef = useRef<Set<number>>(new Set());
  const listIdsRef = useRef<Set<number>>(new Set());
  const seedIdsRef = useRef<number[]>([]);
  const recPageRef = useRef(1);

  // "More" sheet: the whole row as a grid, with load-more.
  const [sheetKey, setSheetKey] = useState<string | null>(null);
  const [sheetItems, setSheetItems] = useState<Rec[]>([]);
  const [sheetBusy, setSheetBusy] = useState(false);
  const [sheetDone, setSheetDone] = useState(false);
  const sheetCursor = useRef(0);
  const sheetGen = useRef(0);
  const insets = useSafeAreaInsets();

  // "Just streaming in the US": independent of your ratings, refreshed once per language (or on pull).
  const loadUsNew = async (listIds: Set<number>, force: boolean) => {
    if (!force && usNewLang.current === titleLang) return;
    const dismissed = await getDismissed();
    try {
      const all = await usNewOnDigital(titleLang);
      const top: Rec[] = all
        .filter((r) => !listIds.has(r.tmdb_id) && !dismissed.has(r.tmdb_id))
        .map((r) => ({ ...r, score: 0 }));
      usNewLang.current = titleLang;
      setUsNew(top);
      AsyncStorage.setItem(US_NEW_KEY, JSON.stringify(top.slice(0, ROW_SIZE))).catch(() => {});
      loadExtrasBatched(top.slice(0, ROW_SIZE).map((r) => r.tmdb_id), titleLang, (batch) => {
        setUsNew((prev) => prev.map((x) => (batch[x.tmdb_id] ? withExtras(x, batch[x.tmdb_id]) : x)));
      });
    } catch {
      try {
        const raw = await AsyncStorage.getItem(US_NEW_KEY);
        if (raw) setUsNew((prev) => (prev.length ? prev : JSON.parse(raw)));
      } catch {}
    }
  };

  const usStatus = (r: Rec): Status => {
    if (!r.providersLoaded) return null;
    const mine = r.ours.find((o) => services.includes(o.key));
    if (mine) return { text: t.usOnService(mine.key), color: theme.green };
    if (r.nlRent?.length) {
      return { text: t.usRentNL(r.nlRent.find((n) => n.startsWith('Path')) ?? r.nlRent[0]), color: theme.gold };
    }
    return { text: t.usNotNL, color: theme.textFaint };
  };

  const build = useCallback(async (force = false) => {
    if (!session) return;
    let movies: MovieRow[] = [];
    try {
      movies = await fetchMovies(session.listId);
    } catch {
      // Offline: fall back to the last computed recommendations.
      try {
        const raw = await AsyncStorage.getItem('filmavond.recs');
        if (raw) setRecs((prev) => (prev.length ? prev : JSON.parse(raw)));
        const rawUs = await AsyncStorage.getItem(US_NEW_KEY);
        if (rawUs) setUsNew((prev) => (prev.length ? prev : JSON.parse(rawUs)));
      } catch {}
      setLoading(false);
      return;
    }
    const listIds = new Set(movies.map((m) => m.tmdb_id).filter(Boolean) as number[]);
    setAdded(listIds);
    listIdsRef.current = listIds;
    loadUsNew(listIds, force);

    // Seeds: movies you rated 7+ first, then the current watchlist.
    const rated = movies.filter((m) => m.tmdb_id && m.seen && Object.values(m.ratings ?? {}).some((v) => v >= 7));
    const listed = movies.filter((m) => m.tmdb_id && !m.seen);
    const seeds = [...rated, ...listed].slice(0, MAX_SEEDS);
    const sig = seeds.map((s) => s.tmdb_id).join(',') + `:${titleLang}`;
    if (!force && sig === seedSig && recs.length) { setLoading(false); return; }
    setSeedSig(sig);

    if (!seeds.length) { setRecs([]); setLoading(false); return; }
    const dismissed = await getDismissed();
    const exclude = new Set([
      ...(movies.map((m) => m.tmdb_id).filter(Boolean) as number[]),
      ...dismissed,
    ]);

    const lists = await Promise.all(seeds.map((s) => recommendationsFor(s.tmdb_id!, titleLang)));
    const pool = scoreLists(lists, (id) => exclude.has(id));
    poolRef.current = pool;
    excludeRef.current = exclude;
    seedIdsRef.current = seeds.map((s) => s.tmdb_id!);
    recPageRef.current = 1;
    const top = pool.slice(0, MAX_RESULTS);
    if (!top.length) {
      // TMDB unreachable: keep whatever we had (cache) instead of blanking the tab.
      try {
        const raw = await AsyncStorage.getItem('filmavond.recs');
        if (raw) setRecs((prev) => (prev.length ? prev : JSON.parse(raw)));
      } catch {}
      setLoading(false);
      return;
    }
    setRecs(top);
    AsyncStorage.setItem('filmavond.recs', JSON.stringify(top)).catch(() => {});
    setLoading(false);

    // Load runtime/age/services per movie (cached) so the theme rows can fill up.
    loadExtrasBatched(top.map((r) => r.tmdb_id), titleLang, (batch) => {
      setRecs((prev) => prev.map((x) => (batch[x.tmdb_id] ? withExtras(x, batch[x.tmdb_id]) : x)));
    });
  }, [session, titleLang, seedSig, recs.length]);

  useFocusEffect(useCallback(() => { build(); }, [build]));

  const onRefresh = async () => { setRefreshing(true); await build(true); setRefreshing(false); };

  // Theme rows: a filter + sort over the scored recommendations (the "More" sheet reuses them).
  const rowDefs = useMemo<RowDef[]>(() => {
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
  }, [recs, services]);

  const rows = useMemo(() => rowDefs
    .map((d) => ({ ...d, data: d.key === 'usNew' ? usNew.slice(0, ROW_SIZE) : recs.filter(d.pred).sort(d.sort).slice(0, ROW_SIZE) }))
    .filter((row) => row.data.length >= 3), [rowDefs, recs, usNew]);

  const sheetDef = rowDefs.find((d) => d.key === sheetKey);

  const enrichSheet = (items: Rec[]) => {
    loadExtrasBatched(items.filter((x) => !x.providersLoaded).map((x) => x.tmdb_id), titleLang, (batch) => {
      setSheetItems((prev) => prev.map((x) => (batch[x.tmdb_id] ? withExtras(x, batch[x.tmdb_id]) : x)));
    });
  };

  const openSheet = (def: RowDef) => {
    hTap();
    sheetGen.current++;
    setSheetKey(def.key);
    setSheetDone(false);
    setSheetBusy(false);
    if (def.key === 'usNew') {
      setSheetItems(usNew);
      sheetCursor.current = 3; // pages 1–2 are already in usNew
      enrichSheet(usNew);
    } else {
      setSheetItems(recs.filter(def.pred).sort(def.sort));
      sheetCursor.current = Math.min(poolRef.current.length, MAX_RESULTS);
    }
  };

  // Next page of recommendations for every seed, merged into the pool.
  const growPool = async (): Promise<boolean> => {
    if (recPageRef.current >= 10 || !seedIdsRef.current.length) return false;
    const page = ++recPageRef.current;
    const lists = await Promise.all(seedIdsRef.current.map((id) => recommendationsFor(id, titleLang, page)));
    const known = new Set(poolRef.current.map((r) => r.tmdb_id));
    const extra = scoreLists(lists, (id) => known.has(id) || excludeRef.current.has(id));
    poolRef.current = [...poolRef.current, ...extra];
    return extra.length > 0;
  };

  const loadMoreSheet = async () => {
    const def = sheetDef;
    if (!def || sheetBusy || sheetDone) return;
    const gen = sheetGen.current;
    setSheetBusy(true);
    const dismissed = await getDismissed();
    const have = new Set(sheetItems.map((x) => x.tmdb_id));
    const fresh: Rec[] = [];
    let done = false;
    try {
      if (def.key === 'usNew') {
        for (let i = 0; i < 3 && fresh.length < 12 && !done; i++) {
          const page = sheetCursor.current++;
          const d = await usNewPage(titleLang, page);
          if (page >= d.totalPages || !d.results.length) done = true;
          const cand = d.results.filter((r) =>
            !have.has(r.tmdb_id) && !listIdsRef.current.has(r.tmdb_id) && !dismissed.has(r.tmdb_id));
          const ex = await getExtrasMany(cand.map((r) => r.tmdb_id), titleLang);
          cand.forEach((r) => {
            have.add(r.tmdb_id);
            const rec: Rec = { ...r, score: 0 };
            fresh.push(ex[r.tmdb_id] ? withExtras(rec, ex[r.tmdb_id]) : rec);
          });
        }
      } else {
        for (let i = 0; i < 4 && fresh.length < 12; i++) {
          if (sheetCursor.current >= poolRef.current.length && !(await growPool())) { done = true; break; }
          const chunk = poolRef.current.slice(sheetCursor.current, sheetCursor.current + 30);
          sheetCursor.current += chunk.length;
          const cand = chunk.filter((r) => !have.has(r.tmdb_id) && !dismissed.has(r.tmdb_id));
          const ex = await getExtrasMany(cand.map((r) => r.tmdb_id), titleLang);
          cand
            .map((r) => (ex[r.tmdb_id] ? withExtras(r, ex[r.tmdb_id]) : r))
            .filter(def.pred)
            .sort(def.sort)
            .forEach((r) => { have.add(r.tmdb_id); fresh.push(r); });
        }
      }
    } catch { done = true; }
    setSheetBusy(false);
    if (gen !== sheetGen.current) return;
    setSheetItems((prev) => [...prev, ...fresh]);
    if (done) setSheetDone(true);
  };

  const onAdd = async (r: Rec) => {
    if (!session) return;
    hTap();
    setAdded((prev) => new Set(prev).add(r.tmdb_id));
    try {
      await addMovie(session.listId, session.memberName, {
        title: r.title, year: r.year ?? undefined, poster_path: r.poster_path ?? undefined,
        genre: r.genre ?? undefined, tmdb_id: r.tmdb_id,
      });
    } catch { setAdded((prev) => { const n = new Set(prev); n.delete(r.tmdb_id); return n; }); }
  };

  // Hide a recommendation permanently (persisted on this device).
  const dismiss = async (r: Rec) => {
    hMedium();
    setRecs((prev) => prev.filter((x) => x.tmdb_id !== r.tmdb_id));
    setUsNew((prev) => prev.filter((x) => x.tmdb_id !== r.tmdb_id));
    setSheetItems((prev) => prev.filter((x) => x.tmdb_id !== r.tmdb_id));
    const d = await getDismissed();
    d.add(r.tmdb_id);
    AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify([...d])).catch(() => {});
  };

  // "Already seen": positive signal — goes onto your Seen list (rate it there later).
  const markAlreadySeen = async (r: Rec) => {
    if (!session) return;
    hTap();
    setRecs((prev) => prev.filter((x) => x.tmdb_id !== r.tmdb_id));
    setUsNew((prev) => prev.filter((x) => x.tmdb_id !== r.tmdb_id));
    setSheetItems((prev) => prev.filter((x) => x.tmdb_id !== r.tmdb_id));
    setAdded((prev) => new Set(prev).add(r.tmdb_id));
    try {
      await addMovie(session.listId, session.memberName, {
        title: r.title, year: r.year ?? undefined, poster_path: r.poster_path ?? undefined,
        genre: r.genre ?? undefined, tmdb_id: r.tmdb_id,
        seen: true, seen_at: new Date().toISOString(),
      } as any);
    } catch {}
  };

  const openActions = (r: Rec) => {
    hTap();
    setActionFor(r);
  };

  return (
    <Background>
      {loading && !recs.length ? (
        <SkeletonRows />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingVertical: 14, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.red} colors={[theme.red]} />}
        >
          {rows.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="sparkles-outline" size={34} color={theme.textFaint} />
              <Text style={styles.emptyText}>{t.recomEmpty}</Text>
            </View>
          ) : rows.map((row) => (
            <Animated.View key={row.key} entering={FadeIn.duration(250)} style={styles.row}>
              <View style={styles.rowHeader}>
                <Ionicons name={row.icon} size={16} color={theme.red} />
                <Text style={styles.rowTitle}>{row.title}</Text>
              </View>
              {row.hint ? <Text style={styles.rowHint}>{row.hint}</Text> : null}
              <FlatList
                horizontal
                data={row.data}
                keyExtractor={(r) => `${row.key}-${r.tmdb_id}`}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rowContent}
                renderItem={({ item }) => (
                  <PosterCard
                    item={item}
                    isAdded={added.has(item.tmdb_id)}
                    onPress={() => setDetailFor(item)}
                    onAction={() => openActions(item)}
                    status={row.key === 'usNew' ? usStatus(item) : undefined}
                  />
                )}
                ListFooterComponent={
                  <TouchableOpacity style={styles.moreTile} onPress={() => openSheet(row)} activeOpacity={0.85}>
                    <View style={styles.moreCircle}><Ionicons name="arrow-forward" size={22} color={theme.red} /></View>
                    <Text style={styles.moreTileText}>{t.more}</Text>
                  </TouchableOpacity>
                }
              />
            </Animated.View>
          ))}
        </ScrollView>
      )}

      <Modal visible={!!sheetDef} animationType="slide" statusBarTranslucent onRequestClose={() => setSheetKey(null)}>
        <View style={[styles.sheet, { paddingTop: insets.top }]}>
          <View style={styles.sheetHeader}>
            <TouchableOpacity onPress={() => setSheetKey(null)} style={styles.sheetBack}>
              <Ionicons name="chevron-back" size={24} color={theme.text} />
            </TouchableOpacity>
            {sheetDef ? <Ionicons name={sheetDef.icon} size={17} color={theme.red} /> : null}
            <Text style={styles.sheetTitle} numberOfLines={1}>{sheetDef?.title}</Text>
          </View>
          <FlatList
            data={sheetItems}
            keyExtractor={(r) => `sheet-${r.tmdb_id}`}
            numColumns={3}
            columnWrapperStyle={{ gap: 10 }}
            contentContainerStyle={{ padding: 16, paddingBottom: 24 + insets.bottom, gap: 16 }}
            renderItem={({ item }) => (
              <PosterCard
                item={item}
                width={GRID_W}
                isAdded={added.has(item.tmdb_id)}
                onPress={() => setDetailFor(item)}
                onAction={() => openActions(item)}
                status={sheetKey === 'usNew' ? usStatus(item) : undefined}
              />
            )}
            ListFooterComponent={sheetDone ? null : (
              <TouchableOpacity style={styles.loadMoreBtn} onPress={loadMoreSheet} disabled={sheetBusy}>
                {sheetBusy ? <ActivityIndicator color={theme.text} /> : <Text style={styles.loadMoreText}>{t.loadMore}</Text>}
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

      <Modal visible={!!actionFor} transparent animationType="fade" onRequestClose={() => setActionFor(null)}>
        <Pressable style={styles.backdrop} onPress={() => setActionFor(null)}>
          <View style={styles.menu}>
            <Text style={styles.menuTitle} numberOfLines={2}>{actionFor?.title}</Text>
            {actionFor && added.has(actionFor.tmdb_id) ? (
              <View style={styles.menuItem}>
                <Ionicons name="checkmark" size={18} color={theme.green} />
                <Text style={[styles.menuItemText, { color: theme.textMuted }]}>{t.onList}</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.menuItem} onPress={() => { const r = actionFor!; setActionFor(null); onAdd(r); }}>
                <Ionicons name="add" size={18} color={theme.red} />
                <Text style={styles.menuItemText}>{t.addToList}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.menuItem} onPress={() => { const r = actionFor!; setActionFor(null); markAlreadySeen(r); }}>
              <Ionicons name="eye-outline" size={18} color={theme.text} />
              <Text style={styles.menuItemText}>{t.alreadySeen}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { const r = actionFor!; setActionFor(null); dismiss(r); }}>
              <Ionicons name="eye-off-outline" size={18} color={theme.red} />
              <Text style={[styles.menuItemText, { color: theme.red }]}>{t.notInterested}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuCancel} onPress={() => setActionFor(null)}>
              <Text style={styles.menuCancelText}>{t.cancel}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <MovieDetails target={detailFor} lang={titleLang} onClose={() => setDetailFor(null)} />
    </Background>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { marginBottom: 24 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginBottom: 10 },
  rowTitle: { color: theme.text, fontSize: 16, fontWeight: '600' },
  moreTile: { width: 84, height: 166, alignItems: 'center', justifyContent: 'center', gap: 8 },
  moreCircle: {
    width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: theme.red,
    backgroundColor: 'rgba(225,29,42,0.10)', alignItems: 'center', justifyContent: 'center',
  },
  moreTileText: { color: theme.text, fontSize: 13, fontWeight: '600' },
  sheet: { flex: 1, backgroundColor: theme.bg },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, height: 56,
    borderBottomWidth: 1, borderBottomColor: theme.border, backgroundColor: theme.surfaceOpaque,
  },
  sheetBack: { padding: 8 },
  sheetTitle: { flex: 1, color: theme.text, fontSize: 17, fontWeight: '600' },
  loadMoreBtn: {
    marginTop: 8, alignSelf: 'center', paddingHorizontal: 22, paddingVertical: 12, minWidth: 140, alignItems: 'center',
    borderRadius: radius.md, backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border,
  },
  loadMoreText: { color: theme.text, fontSize: 14, fontWeight: '500' },
  rowHint: { color: theme.textFaint, fontSize: 12, paddingHorizontal: 16, marginTop: -6, marginBottom: 10 },
  rowContent: { paddingHorizontal: 16, gap: 12 },
  empty: { alignItems: 'center', marginTop: 80, paddingHorizontal: 32, gap: 12 },
  emptyText: { color: theme.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 21 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 28 },
  menu: { backgroundColor: theme.surfaceOpaque, borderRadius: 16, padding: 8, borderWidth: 1, borderColor: theme.border },
  menuTitle: { color: theme.text, fontSize: 15, fontWeight: '600', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 14, borderRadius: 10 },
  menuItemText: { color: theme.text, fontSize: 15 },
  menuCancel: { alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: theme.border, marginTop: 4 },
  menuCancelText: { color: theme.textMuted, fontSize: 14 },
});

const pc = StyleSheet.create({
  poster: {
    width: 112, height: 166, borderRadius: 10, backgroundColor: theme.surface2,
    overflow: 'hidden', borderWidth: 1, borderColor: theme.border,
  },
  posterEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute', top: 6, left: 6, flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(12,8,7,0.75)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  action: {
    position: 'absolute', bottom: 6, right: 6, width: 28, height: 28, borderRadius: 8,
    borderWidth: 1.5, borderColor: theme.red, backgroundColor: 'rgba(12,8,7,0.72)',
    alignItems: 'center', justifyContent: 'center',
  },
  actionDone: { borderColor: theme.green },
  title: { color: theme.textMuted, fontSize: 12, lineHeight: 16, marginTop: 6 },
  status: { fontSize: 11, fontWeight: '600', marginTop: 3 },
});
