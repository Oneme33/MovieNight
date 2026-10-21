import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { FadeIn } from 'react-native-reanimated';
import { hTap, hMedium } from '../haptics';
import { theme } from '../theme';
import { Background } from '../Background';
import { t } from '../i18n';
import { useSession } from '../ListContext';
import { MovieRow } from '../supabase';
import { fetchMovies, addMovie } from '../db';
import { recommendationsFor, loadExtrasBatched, usNewOnDigital } from '../tmdb';
import { MovieDetails, DetailTarget } from '../MovieDetails';
import { SkeletonRows } from '../Loader';
import {
  Rec, MAX_SEEDS, MAX_RESULTS, ROW_SIZE, DISMISSED_KEY, US_NEW_KEY, withExtras, scoreLists, rowDefinitions, usStatus,
} from '../foryou/logic';
import { PosterCard } from '../foryou/PosterCard';
import { MoreSheet, ActionMenu } from '../foryou/Sheets';
import { useMoreSheet, Pool } from '../foryou/useMoreSheet';

const RECS_KEY = 'filmavond.recs';

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
  const poolRef = useRef<Pool>({ pool: [], exclude: new Set(), listIds: new Set(), seedIds: [], recPage: 1 });
  const sheet = useMoreSheet({ titleLang, recs, usNew, poolRef, getDismissed });

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

  const build = useCallback(async (force = false) => {
    if (!session) return;
    let movies: MovieRow[] = [];
    try {
      movies = await fetchMovies(session.listId);
    } catch {
      // Offline: fall back to the last computed recommendations.
      try {
        const raw = await AsyncStorage.getItem(RECS_KEY);
        if (raw) setRecs((prev) => (prev.length ? prev : JSON.parse(raw)));
        const rawUs = await AsyncStorage.getItem(US_NEW_KEY);
        if (rawUs) setUsNew((prev) => (prev.length ? prev : JSON.parse(rawUs)));
      } catch {}
      setLoading(false);
      return;
    }
    const listIds = new Set(movies.map((m) => m.tmdb_id).filter(Boolean) as number[]);
    setAdded(listIds);
    poolRef.current.listIds = listIds;
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
    const exclude = new Set([...listIds, ...dismissed]);

    const lists = await Promise.all(seeds.map((s) => recommendationsFor(s.tmdb_id!, titleLang)));
    const pool = scoreLists(lists, (id) => exclude.has(id));
    poolRef.current = { ...poolRef.current, pool, exclude, seedIds: seeds.map((s) => s.tmdb_id!), recPage: 1 };
    const top = pool.slice(0, MAX_RESULTS);
    if (!top.length) {
      // TMDB unreachable: keep whatever we had (cache) instead of blanking the tab.
      try {
        const raw = await AsyncStorage.getItem(RECS_KEY);
        if (raw) setRecs((prev) => (prev.length ? prev : JSON.parse(raw)));
      } catch {}
      setLoading(false);
      return;
    }
    setRecs(top);
    AsyncStorage.setItem(RECS_KEY, JSON.stringify(top)).catch(() => {});
    setLoading(false);

    // Load runtime/age/services per movie (cached) so the theme rows can fill up.
    loadExtrasBatched(top.map((r) => r.tmdb_id), titleLang, (batch) => {
      setRecs((prev) => prev.map((x) => (batch[x.tmdb_id] ? withExtras(x, batch[x.tmdb_id]) : x)));
    });
  }, [session, titleLang, seedSig, recs.length]);

  useFocusEffect(useCallback(() => { build(); }, [build]));
  const onRefresh = async () => { setRefreshing(true); await build(true); setRefreshing(false); };

  const rowDefs = useMemo(() => rowDefinitions(recs, services), [recs, services]);
  const rows = useMemo(() => rowDefs
    .map((d) => ({ ...d, data: d.key === 'usNew' ? usNew.slice(0, ROW_SIZE) : recs.filter(d.pred).sort(d.sort).slice(0, ROW_SIZE) }))
    .filter((row) => row.data.length >= 3), [rowDefs, recs, usNew]);
  const sheetDef = rowDefs.find((d) => d.key === sheet.key);

  const removeEverywhere = (r: Rec) => {
    setRecs((prev) => prev.filter((x) => x.tmdb_id !== r.tmdb_id));
    setUsNew((prev) => prev.filter((x) => x.tmdb_id !== r.tmdb_id));
    sheet.remove(r.tmdb_id);
  };
  const saveToList = async (r: Rec, seen: boolean) => {
    if (!session) return;
    setAdded((prev) => new Set(prev).add(r.tmdb_id));
    try {
      await addMovie(session.listId, session.memberName, {
        title: r.title, year: r.year ?? undefined, poster_path: r.poster_path ?? undefined,
        genre: r.genre ?? undefined, tmdb_id: r.tmdb_id,
        ...(seen ? { seen: true, seen_at: new Date().toISOString() } : {}),
      } as any);
    } catch { if (!seen) setAdded((prev) => { const n = new Set(prev); n.delete(r.tmdb_id); return n; }); }
  };
  const onAdd = (r: Rec) => { hTap(); saveToList(r, false); };
  // "Already seen": positive signal — goes onto your Seen list (rate it there later).
  const markAlreadySeen = (r: Rec) => { hTap(); removeEverywhere(r); saveToList(r, true); };
  // Hide a recommendation permanently (persisted on this device).
  const dismiss = async (r: Rec) => {
    hMedium();
    removeEverywhere(r);
    const d = await getDismissed();
    d.add(r.tmdb_id);
    AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify([...d])).catch(() => {});
  };
  const openActions = (r: Rec) => { hTap(); setActionFor(r); };

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
            <View style={s.empty}>
              <Ionicons name="sparkles-outline" size={34} color={theme.textFaint} />
              <Text style={s.emptyText}>{t.recomEmpty}</Text>
            </View>
          ) : rows.map((row) => (
            <Animated.View key={row.key} entering={FadeIn.duration(250)} style={s.row}>
              <View style={s.rowHeader}>
                <Ionicons name={row.icon} size={16} color={theme.red} />
                <Text style={s.rowTitle}>{row.title}</Text>
              </View>
              {row.hint ? <Text style={s.rowHint}>{row.hint}</Text> : null}
              <FlatList
                horizontal
                data={row.data}
                keyExtractor={(r) => `${row.key}-${r.tmdb_id}`}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.rowContent}
                renderItem={({ item }) => (
                  <PosterCard item={item} isAdded={added.has(item.tmdb_id)} onPress={() => setDetailFor(item)}
                    onAction={() => openActions(item)} status={row.key === 'usNew' ? usStatus(item, services) : undefined} />
                )}
                ListFooterComponent={
                  <TouchableOpacity style={s.moreTile} onPress={() => sheet.open(row)} activeOpacity={0.85}>
                    <View style={s.moreCircle}><Ionicons name="arrow-forward" size={22} color={theme.red} /></View>
                    <Text style={s.moreTileText}>{t.more}</Text>
                  </TouchableOpacity>
                }
              />
            </Animated.View>
          ))}
        </ScrollView>
      )}

      <MoreSheet
        def={sheetDef} items={sheet.items} added={added} busy={sheet.busy} done={sheet.done}
        statusOf={(r) => (sheet.key === 'usNew' ? usStatus(r, services) : undefined)}
        onClose={sheet.close} onLoadMore={() => sheet.loadMore(sheetDef)} onOpen={setDetailFor} onAction={openActions}
      />
      <ActionMenu
        item={actionFor} isAdded={!!actionFor && added.has(actionFor.tmdb_id)} onClose={() => setActionFor(null)}
        onAdd={onAdd} onSeen={markAlreadySeen} onDismiss={dismiss}
      />
      <MovieDetails target={detailFor} lang={titleLang} onClose={() => setDetailFor(null)} />
    </Background>
  );
}

const s = StyleSheet.create({
  row: { marginBottom: 24 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginBottom: 10 },
  rowTitle: { color: theme.text, fontSize: 16, fontWeight: '600' },
  rowHint: { color: theme.textFaint, fontSize: 12, paddingHorizontal: 16, marginTop: -6, marginBottom: 10 },
  rowContent: { paddingHorizontal: 16, gap: 12 },
  moreTile: { width: 84, height: 166, alignItems: 'center', justifyContent: 'center', gap: 8 },
  moreCircle: {
    width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: theme.red,
    backgroundColor: 'rgba(225,29,42,0.10)', alignItems: 'center', justifyContent: 'center',
  },
  moreTileText: { color: theme.text, fontSize: 13, fontWeight: '600' },
  empty: { alignItems: 'center', marginTop: 80, paddingHorizontal: 32, gap: 12 },
  emptyText: { color: theme.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 21 },
});
