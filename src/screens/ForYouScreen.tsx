import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View, Text, FlatList, ScrollView, TouchableOpacity, StyleSheet, Image,
  ActivityIndicator, RefreshControl, Modal, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { FadeIn } from 'react-native-reanimated';
import { hTap, hMedium } from '../haptics';
import { theme, radius } from '../theme';
import { Background } from '../Background';
import { t } from '../i18n';
import { useSession } from '../ListContext';
import { MovieRow } from '../supabase';
import { fetchMovies, addMovie } from '../db';
import { recommendationsFor, getMovieExtras, IMG, SearchResult } from '../tmdb';
import { MovieDetails, DetailTarget } from '../MovieDetails';

type Rec = SearchResult & { score: number };

const MAX_SEEDS = 12;
const MAX_RESULTS = 50;
const ROW_SIZE = 12;
const DISMISSED_KEY = 'filmavond.dismissedRecs';

function PosterCard({ item, isAdded, onPress, onAction }: {
  item: Rec; isAdded: boolean; onPress: () => void; onAction: () => void;
}) {
  const poster = IMG(item.poster_path, 'w342');
  return (
    <TouchableOpacity style={pc.wrap} onPress={onPress} onLongPress={onAction} delayLongPress={280} activeOpacity={0.85}>
      <View style={pc.poster}>
        {poster ? (
          <Image source={{ uri: poster }} style={pc.posterImg} />
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
      } catch {}
      setLoading(false);
      return;
    }
    setAdded(new Set(movies.map((m) => m.tmdb_id).filter(Boolean) as number[]));

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
    // Score: how often a movie is recommended across seeds (+ position & popularity as tiebreaker).
    const scored = new Map<number, Rec>();
    lists.forEach((list) => {
      list.forEach((r, i) => {
        if (exclude.has(r.tmdb_id)) return;
        const bonus = 1000 + (20 - Math.min(i, 20)) * 10 + (r.popularity ?? 0) / 100;
        const cur = scored.get(r.tmdb_id);
        if (cur) cur.score += bonus;
        else scored.set(r.tmdb_id, { ...r, score: bonus });
      });
    });
    const top = [...scored.values()].sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS);
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
    top.forEach(async (r) => {
      const ex = await getMovieExtras(r.tmdb_id, titleLang);
      setRecs((prev) => prev.map((x) =>
        x.tmdb_id === r.tmdb_id
          ? {
              ...x, ours: ex.ours, hasFlatrate: ex.hasFlatrate, rating: x.rating ?? ex.rating,
              runtime: ex.runtime, certAge: ex.certAge, providersLoaded: true,
            }
          : x));
    });
  }, [session, titleLang, seedSig, recs.length]);

  useFocusEffect(useCallback(() => { build(); }, [build]));

  const onRefresh = async () => { setRefreshing(true); await build(true); setRefreshing(false); };

  // Theme rows, derived from the scored recommendations.
  const rows = useMemo(() => {
    const byScore = (a: Rec, b: Rec) => b.score - a.score;
    const onMyService = (r: Rec) => r.ours.some((o) => services.includes(o.key));
    const popMedian = [...recs].map((r) => r.popularity ?? 0).sort((a, b) => a - b)[Math.floor(recs.length / 2)] ?? 0;
    return [
      { key: 'tonight', title: t.themeTonight, icon: 'sparkles' as const, data: [...recs].sort(byScore).slice(0, ROW_SIZE) },
      { key: 'services', title: t.themeOnServices, icon: 'tv-outline' as const, data: recs.filter(onMyService).sort(byScore).slice(0, ROW_SIZE) },
      { key: 'short', title: t.themeShort, icon: 'hourglass-outline' as const, data: recs.filter((r) => r.runtime != null && r.runtime <= 90).sort(byScore).slice(0, ROW_SIZE) },
      { key: 'top', title: t.themeTop, icon: 'star-outline' as const, data: recs.filter((r) => r.rating != null).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, ROW_SIZE) },
      { key: 'kids', title: t.themeKids, icon: 'happy-outline' as const, data: recs.filter((r) => r.certAge != null && r.certAge <= 9).sort(byScore).slice(0, ROW_SIZE) },
      { key: 'gems', title: t.themeGems, icon: 'diamond-outline' as const, data: recs.filter((r) => (r.rating ?? 0) >= 7 && (r.popularity ?? 0) <= popMedian).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, ROW_SIZE) },
    ].filter((row) => row.data.length >= 3);
  }, [recs, services]);

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
    const d = await getDismissed();
    d.add(r.tmdb_id);
    AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify([...d])).catch(() => {});
  };

  // "Already seen": positive signal — goes onto your Seen list (rate it there later).
  const markAlreadySeen = async (r: Rec) => {
    if (!session) return;
    hTap();
    setRecs((prev) => prev.filter((x) => x.tmdb_id !== r.tmdb_id));
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
        <View style={styles.center}><ActivityIndicator color={theme.red} /></View>
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
                  />
                )}
              />
            </Animated.View>
          ))}
        </ScrollView>
      )}

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
  wrap: { width: 112 },
  poster: {
    width: 112, height: 166, borderRadius: 10, backgroundColor: theme.surface2,
    overflow: 'hidden', borderWidth: 1, borderColor: theme.border,
  },
  posterImg: { width: 112, height: 166 },
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
});
