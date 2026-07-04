import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Image,
  ActivityIndicator, Modal, Pressable, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { TouchableOpacity as GHTouchable } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { theme, radius } from '../theme';
import { Background } from '../Background';
import { t } from '../i18n';
import { useSession } from '../ListContext';
import { MovieRow } from '../supabase';
import { fetchMovies, addMovie } from '../db';
import { recommendationsFor, getMovieExtras, IMG, LOGO, SearchResult } from '../tmdb';
import { MovieDetails, DetailTarget } from '../MovieDetails';

type RecSort = 'best' | 'nieuw' | 'waardering';
const SORTS: { key: RecSort; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'best', label: t.sortBest, icon: 'sparkles' },
  { key: 'nieuw', label: t.jaarDown, icon: 'arrow-down' },
  { key: 'waardering', label: t.sortRating, icon: 'star' },
];

const MAX_SEEDS = 12;
const MAX_RESULTS = 30;
const DISMISSED_KEY = 'filmavond.dismissedRecs';

// Swipe-away wrapper; the action fades with the swipe so nothing bleeds through the glass card.
function DismissibleRow({ children, onDismiss }: { children: React.ReactNode; onDismiss: () => void }) {
  const [rowH, setRowH] = useState(0);
  const actions = (progress: SharedValue<number>) => {
    const AnimatedBtn = () => {
      const style = useAnimatedStyle(() => ({ opacity: Math.min(progress.value, 1) }));
      return (
        <Animated.View style={style}>
          <GHTouchable
            style={[styles.dismissBtn, { height: rowH || undefined }]}
            onPress={onDismiss}
          >
            <Ionicons name="eye-off-outline" size={20} color="#fff" />
            <Text style={styles.dismissText}>{t.notInterested}</Text>
          </GHTouchable>
        </Animated.View>
      );
    };
    return <AnimatedBtn />;
  };
  return (
    <ReanimatedSwipeable
      renderRightActions={actions}
      overshootRight={false}
      rightThreshold={70}
      friction={1.6}
    >
      <View onLayout={(e) => setRowH(e.nativeEvent.layout.height - 10)}>{children}</View>
    </ReanimatedSwipeable>
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
  const [recs, setRecs] = useState<(SearchResult & { score: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [seedSig, setSeedSig] = useState('');
  const [sort, setSort] = useState<RecSort>('best');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [streamOnly, setStreamOnly] = useState(false);
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [detailFor, setDetailFor] = useState<DetailTarget>(null);

  const build = useCallback(async (force = false) => {
    if (!session) return;
    let movies: MovieRow[] = [];
    try { movies = await fetchMovies(session.listId); } catch { setLoading(false); return; }
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
    const scored = new Map<number, SearchResult & { score: number }>();
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
    setRecs(top);
    setLoading(false);

    // Load services/runtime per movie (cached).
    top.forEach(async (r) => {
      const ex = await getMovieExtras(r.tmdb_id, titleLang);
      setRecs((prev) => prev.map((x) =>
        x.tmdb_id === r.tmdb_id
          ? { ...x, ours: ex.ours, rating: x.rating ?? ex.rating, runtime: ex.runtime, providersLoaded: true }
          : x));
    });
  }, [session, titleLang, seedSig, recs.length]);

  useFocusEffect(useCallback(() => { build(); }, [build]));

  const onRefresh = async () => { setRefreshing(true); await build(true); setRefreshing(false); };

  const visible = useMemo(() => {
    let arr = recs;
    if (streamOnly) arr = arr.filter((r) => !r.providersLoaded || r.ours.some((o) => services.includes(o.key)));
    if (sort === 'nieuw') arr = [...arr].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    else if (sort === 'waardering') arr = [...arr].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
    return arr;
  }, [recs, sort, streamOnly, services]);

  const dismiss = async (r: SearchResult) => {
    setRecs((prev) => prev.filter((x) => x.tmdb_id !== r.tmdb_id));
    const d = await getDismissed();
    d.add(r.tmdb_id);
    AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify([...d])).catch(() => {});
  };

  const onAdd = async (r: SearchResult) => {
    if (!session) return;
    setAdded((prev) => new Set(prev).add(r.tmdb_id));
    try {
      await addMovie(session.listId, session.memberName, {
        title: r.title, year: r.year ?? undefined, poster_path: r.poster_path ?? undefined,
        genre: r.genre ?? undefined, tmdb_id: r.tmdb_id,
      });
    } catch { setAdded((prev) => { const n = new Set(prev); n.delete(r.tmdb_id); return n; }); }
  };

  const renderItem = ({ item }: { item: SearchResult }) => {
    const poster = IMG(item.poster_path, 'w200');
    const isAdded = added.has(item.tmdb_id);
    return (
      <DismissibleRow onDismiss={() => dismiss(item)}>
      <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => setDetailFor(item)}>
        <View style={styles.poster}>
          {poster ? <Image source={{ uri: poster }} style={styles.posterImg} />
            : <Ionicons name="film-outline" size={22} color={theme.textFaint} />}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title} {item.year ? <Text style={styles.year}>({item.year})</Text> : null}
          </Text>
          <View style={styles.subRow}>
            {item.rating != null ? (
              <View style={styles.rating}><Ionicons name="star" size={12} color={theme.gold} /><Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text></View>
            ) : null}
            {item.genre ? <Text style={styles.genre}>{item.genre}</Text> : null}
            {item.runtime ? <Text style={styles.genre}>· {item.runtime} min</Text> : null}
          </View>
          <View style={styles.badges}>
            {!item.providersLoaded ? <Text style={styles.faint}>{t.providersLoading}</Text>
              : item.ours.length ? item.ours.map((p) => {
                const l = LOGO(p.logo_path);
                return l ? <Image key={p.key} source={{ uri: l }} style={styles.logo} /> : null;
              }) : <Text style={styles.faint}>{t.notOnServices}</Text>}
          </View>
        </View>
        <TouchableOpacity style={[styles.addBtn, isAdded && styles.addBtnDone]} onPress={() => onAdd(item)} disabled={isAdded}>
          <Ionicons name={isAdded ? 'checkmark' : 'add'} size={22} color="#fff" />
        </TouchableOpacity>
      </TouchableOpacity>
      </DismissibleRow>
    );
  };

  return (
    <Background>
     <View style={styles.container}>
      <View style={styles.controls}>
        <TouchableOpacity style={styles.ctrlBtn} onPress={() => setSortMenuOpen(true)} activeOpacity={0.8}>
          <Ionicons name="swap-vertical" size={15} color={theme.text} />
          <Text style={styles.ctrlText} numberOfLines={1}>{SORTS.find((s) => s.key === sort)!.label}</Text>
          <Ionicons name="chevron-down" size={14} color={theme.textMuted} style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.ctrlBtn, streamOnly && styles.ctrlBtnOn]}
          onPress={() => setStreamOnly((v) => !v)} activeOpacity={0.8}
        >
          <Ionicons name="tv-outline" size={15} color={streamOnly ? '#fff' : theme.text} />
          <Text style={[styles.ctrlText, streamOnly && { color: '#fff' }]}>{t.streaming}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.red} /></View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={visible}
          keyExtractor={(r) => String(r.tmdb_id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.red} colors={[theme.red]} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="sparkles-outline" size={34} color={theme.textFaint} />
              <Text style={styles.emptyText}>{t.recomEmpty}</Text>
            </View>
          }
        />
      )}
     </View>

     <Modal visible={sortMenuOpen} transparent animationType="fade" onRequestClose={() => setSortMenuOpen(false)}>
       <Pressable style={styles.backdrop} onPress={() => setSortMenuOpen(false)}>
         <View style={styles.menu}>
           <Text style={styles.menuTitle}>{t.sortBy}</Text>
           {SORTS.map((s) => (
             <TouchableOpacity key={s.key} style={styles.menuItem} onPress={() => { setSort(s.key); setSortMenuOpen(false); }}>
               <Ionicons name={s.icon} size={18} color={sort === s.key ? theme.red : theme.textMuted} />
               <Text style={[styles.menuItemText, sort === s.key && { color: theme.red, fontWeight: '600' }]}>{s.label}</Text>
               {sort === s.key ? <Ionicons name="checkmark" size={18} color={theme.red} style={{ marginLeft: 'auto' }} /> : null}
             </TouchableOpacity>
           ))}
         </View>
       </Pressable>
     </Modal>

     <MovieDetails target={detailFor} lang={titleLang} onClose={() => setDetailFor(null)} />
    </Background>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent', paddingHorizontal: 16 },
  controls: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 4 },
  ctrlBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.surface2,
    borderRadius: radius.md, paddingHorizontal: 12, height: 40, borderWidth: 1, borderColor: theme.border,
  },
  ctrlBtnOn: { backgroundColor: theme.red, borderColor: theme.red },
  ctrlText: { color: theme.text, fontSize: 13, fontWeight: '500' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.surface,
    borderRadius: radius.md, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: theme.border,
  },
  poster: { width: 46, height: 68, borderRadius: 6, backgroundColor: theme.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  posterImg: { width: 46, height: 68 },
  title: { color: theme.text, fontSize: 15, fontWeight: '600' },
  year: { color: theme.textMuted, fontWeight: '400' },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 3 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingText: { color: theme.gold, fontSize: 12, fontWeight: '600' },
  genre: { color: theme.textMuted, fontSize: 12 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, alignItems: 'center' },
  logo: { width: 24, height: 24, borderRadius: 6, backgroundColor: '#fff' },
  faint: { color: theme.textFaint, fontSize: 12 },
  addBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: theme.red, alignItems: 'center', justifyContent: 'center' },
  addBtnDone: { backgroundColor: theme.green },
  dismissBtn: { width: 104, borderRadius: radius.md, backgroundColor: theme.textFaint, alignItems: 'center', justifyContent: 'center', gap: 2 },
  dismissText: { color: '#fff', fontSize: 11 },
  empty: { alignItems: 'center', marginTop: 60, paddingHorizontal: 24, gap: 12 },
  emptyText: { color: theme.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 21 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 28 },
  menu: { backgroundColor: theme.surfaceOpaque, borderRadius: 16, padding: 8, borderWidth: 1, borderColor: theme.border },
  menuTitle: { color: theme.textMuted, fontSize: 12, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 14, borderRadius: 10 },
  menuItemText: { color: theme.text, fontSize: 15 },
});
