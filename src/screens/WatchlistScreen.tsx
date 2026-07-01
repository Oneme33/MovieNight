import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
  Image, FlatList, RefreshControl, Modal, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { TouchableOpacity as GHTouchable } from 'react-native-gesture-handler';
import { theme, radius } from '../theme';
import { Background } from '../Background';
import { t } from '../i18n';
import { useSession } from '../ListContext';
import { supabase, MovieRow } from '../supabase';
import { fetchMovies, deleteMovie, persistOrder, markSeen, unmarkSeen } from '../db';
import { IMG, LOGO, getMovieExtras, MovieExtras } from '../tmdb';

type SortMode = 'nieuw' | 'waardering' | 'titel' | 'streaming' | 'handmatig';
const SORTS: { key: SortMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'nieuw', label: t.sortNewest, icon: 'time-outline' },
  { key: 'waardering', label: t.sortRating, icon: 'star-outline' },
  { key: 'titel', label: t.sortTitle, icon: 'text-outline' },
  { key: 'streaming', label: t.sortStreaming, icon: 'tv-outline' },
  { key: 'handmatig', label: t.sortManual, icon: 'reorder-three-outline' },
];

type SeenSort = 'datum' | 'titel' | 'cijfer';
const SEEN_SORTS: { key: SeenSort; label: string }[] = [
  { key: 'datum', label: t.seenDate },
  { key: 'titel', label: t.seenTitle },
  { key: 'cijfer', label: t.seenRating },
];

const avg = (r?: Record<string, number> | null) => {
  const v = Object.values(r ?? {});
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : -1;
};

const Separator = () => <View style={{ height: 10 }} />;

// Stable card component (defined outside the screen → swipe stays smooth).
type CardProps = {
  item: MovieRow;
  index: number;
  title: string;
  ex?: MovieExtras;
  canDrag: boolean;
  drag?: () => void;
  isActive?: boolean;
  onDelete: (m: MovieRow) => void;
  onUnsee: (m: MovieRow) => void;
  onMarkSeen: (m: MovieRow) => void;
};

const MovieCard = React.memo(function MovieCard(p: CardProps) {
  const { item, index, title, ex, canDrag, drag, isActive } = p;
  const ratingPairs = Object.entries(item.ratings ?? {});
  const [rowH, setRowH] = useState(0);

  const rightActions = () => (
    <GHTouchable style={[styles.actionBtn, { backgroundColor: theme.red, height: rowH || undefined }]} onPress={() => p.onDelete(item)}>
      <Ionicons name="trash" size={22} color="#fff" /><Text style={styles.actionText}>{t.actionDelete}</Text>
    </GHTouchable>
  );
  const leftActions = () => (
    <GHTouchable
      style={[styles.actionBtn, { backgroundColor: item.seen ? theme.textFaint : theme.green, height: rowH || undefined }]}
      onPress={() => (item.seen ? p.onUnsee(item) : p.onMarkSeen(item))}
    >
      <Ionicons name={item.seen ? 'arrow-undo' : 'checkmark-done'} size={22} color="#fff" />
      <Text style={styles.actionText}>{item.seen ? t.actionBack : t.actionSeen}</Text>
    </GHTouchable>
  );

  return (
    <ReanimatedSwipeable
      renderRightActions={rightActions}
      renderLeftActions={leftActions}
      overshootLeft={false}
      overshootRight={false}
      leftThreshold={70}
      rightThreshold={70}
      friction={1.6}
    >
      <TouchableOpacity
        style={[styles.card, isActive && styles.cardActive]}
        onLongPress={canDrag ? drag : undefined}
        delayLongPress={200}
        activeOpacity={0.9}
        onLayout={(e) => setRowH(e.nativeEvent.layout.height)}
      >
        {!item.seen ? <View style={styles.rank}><Text style={styles.rankText}>{index + 1}</Text></View> : null}
        <View style={styles.poster}>
          {item.poster_path ? <Image source={{ uri: IMG(item.poster_path, 'w200')! }} style={styles.posterImg} />
            : <Ionicons name="film-outline" size={22} color={theme.textFaint} />}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <View style={styles.subRow}>
            {ex?.rating != null ? (
              <View style={styles.rating}><Ionicons name="star" size={12} color={theme.gold} /><Text style={styles.ratingText}>{ex.rating.toFixed(1)}</Text></View>
            ) : null}
            {item.year ? <Text style={styles.meta}>{item.year}</Text> : null}
            <Text style={styles.meta}>· {item.added_by ?? '?'}</Text>
          </View>
          {item.seen && ratingPairs.length ? (
            <View style={styles.ourRatings}>
              {ratingPairs.map(([name, score]) => (
                <View key={name} style={styles.ourRating}>
                  <Ionicons name="person" size={10} color={theme.textMuted} />
                  <Text style={styles.ourRatingText}>{name}: {score}</Text>
                </View>
              ))}
            </View>
          ) : ex?.ours?.length ? (
            <View style={styles.logos}>
              {ex.ours.map((pr) => { const l = LOGO(pr.logo_path); return l ? <Image key={pr.key} source={{ uri: l }} style={styles.logo} /> : null; })}
            </View>
          ) : null}
        </View>
        {canDrag ? <Ionicons name="reorder-three" size={22} color={theme.textFaint} /> : null}
      </TouchableOpacity>
    </ReanimatedSwipeable>
  );
});

export default function WatchlistScreen() {
  const { session, titleLang } = useSession();
  const [movies, setMovies] = useState<MovieRow[]>([]);
  const [extras, setExtras] = useState<Record<number, MovieExtras>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sort, setSort] = useState<SortMode>('nieuw');
  const [menuOpen, setMenuOpen] = useState(false);
  const [watchOpen, setWatchOpen] = useState(true);
  const [seenOpen, setSeenOpen] = useState(false);
  const [seenSort, setSeenSort] = useState<SeenSort>('datum');
  const [seenMenuOpen, setSeenMenuOpen] = useState(false);
  const [ratingFor, setRatingFor] = useState<MovieRow | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try { setMovies(await fetchMovies(session.listId)); }
    catch (e: any) { Alert.alert(t.couldntLoad, e.message ?? String(e)); }
    finally { setLoading(false); }
  }, [session]);

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel(`movies-${session.listId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'movies', filter: `list_id=eq.${session.listId}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session, load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { setExtras({}); }, [titleLang]);
  useEffect(() => {
    movies.forEach(async (m) => {
      if (m.tmdb_id && !extras[m.tmdb_id]) {
        const ex = await getMovieExtras(m.tmdb_id, titleLang);
        setExtras((prev) => ({ ...prev, [m.tmdb_id as number]: ex }));
      }
    });
  }, [movies, titleLang, extras]);

  const displayTitle = useCallback(
    (m: MovieRow) => (m.tmdb_id && extras[m.tmdb_id]?.title) || m.title,
    [extras]
  );

  const unseen = useMemo(() => {
    const arr = movies.filter((m) => !m.seen);
    if (sort === 'nieuw') arr.sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
    else if (sort === 'waardering') {
      const r = (m: MovieRow) => (m.tmdb_id && extras[m.tmdb_id]?.rating) || -1;
      arr.sort((a, b) => r(b) - r(a));
    } else if (sort === 'titel') arr.sort((a, b) => displayTitle(a).localeCompare(displayTitle(b), 'nl'));
    else if (sort === 'streaming') {
      const svc = (m: MovieRow) => (m.tmdb_id && extras[m.tmdb_id]?.ours[0]?.key) || '~';
      arr.sort((a, b) => svc(a).localeCompare(svc(b)) || displayTitle(a).localeCompare(displayTitle(b), 'nl'));
    } else arr.sort((a, b) => a.position - b.position);
    return arr;
  }, [movies, sort, extras, displayTitle]);

  const seen = useMemo(() => {
    const arr = movies.filter((m) => m.seen);
    if (seenSort === 'titel') arr.sort((a, b) => displayTitle(a).localeCompare(displayTitle(b), 'nl'));
    else if (seenSort === 'cijfer') arr.sort((a, b) => avg(b.ratings) - avg(a.ratings));
    else arr.sort((a, b) => ((b.seen_at ?? '') > (a.seen_at ?? '') ? 1 : -1));
    return arr;
  }, [movies, seenSort, extras, displayTitle]);

  const patch = (id: string, fields: Partial<MovieRow>) =>
    setMovies((prev) => prev.map((m) => (m.id === id ? { ...m, ...fields } : m)));

  const onDelete = useCallback((m: MovieRow) => {
    setMovies((prev) => prev.filter((x) => x.id !== m.id));
    deleteMovie(m.id).catch(() => load());
  }, [load]);

  const onUnsee = useCallback((m: MovieRow) => {
    patch(m.id, { seen: false, seen_at: null });
    unmarkSeen(m.id).catch(() => load());
  }, [load]);

  const onMarkSeen = useCallback((m: MovieRow) => setRatingFor(m), []);

  const onDragEnd = ({ data }: { data: MovieRow[] }) => {
    persistOrder(data).catch(() => load());
    setMovies((prev) => [...data, ...prev.filter((m) => m.seen)]);
  };

  const chooseScore = (score: number | null) => {
    const m = ratingFor;
    setRatingFor(null);
    if (!m || !session) return;
    const ratings = { ...(m.ratings ?? {}) };
    if (score != null) ratings[session.memberName] = score; else delete ratings[session.memberName];
    patch(m.id, { seen: true, seen_at: new Date().toISOString(), ratings });
    markSeen(m, session.memberName, score).catch(() => load());
  };

  const current = SORTS.find((s) => s.key === sort)!;

  const sectionTitle = (
    icon: keyof typeof Ionicons.glyphMap, label: string, count: number,
    open: boolean, onToggle: () => void, topMargin: boolean
  ) => (
    <TouchableOpacity style={[styles.sectionHeader, { marginTop: topMargin ? 34 : 8 }]} onPress={onToggle} activeOpacity={0.7}>
      <Ionicons name={icon} size={20} color={theme.text} />
      <Text style={styles.sectionTitle}>{label} ({count})</Text>
      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={theme.textMuted} style={{ marginLeft: 'auto' }} />
    </TouchableOpacity>
  );

  const sortButton = (label: string, onPress: () => void) => (
    <TouchableOpacity style={styles.sortBtn} onPress={onPress} activeOpacity={0.8}>
      <Ionicons name="swap-vertical" size={16} color={theme.text} />
      <Text style={styles.sortBtnText}>{t.sortPrefix}{label}</Text>
      <Ionicons name="chevron-down" size={16} color={theme.textMuted} style={{ marginLeft: 'auto' }} />
    </TouchableOpacity>
  );

  const header = (
    <View>
      {sectionTitle('film-outline', t.toWatch, unseen.length, watchOpen, () => setWatchOpen((v) => !v), false)}
      {watchOpen ? sortButton(current.label, () => setMenuOpen(true)) : null}
    </View>
  );

  const footer = (
    <View>
      {sectionTitle('eye-outline', t.seen, seen.length, seenOpen, () => setSeenOpen((v) => !v), true)}
      {seenOpen ? (
        <View style={{ marginTop: 4 }}>
          {sortButton(SEEN_SORTS.find((s) => s.key === seenSort)!.label, () => setSeenMenuOpen(true))}
          {seen.length ? seen.map((m, i) => (
            <View key={m.id} style={{ marginBottom: 10 }}>
              <MovieCard item={m} index={i} title={displayTitle(m)} ex={m.tmdb_id ? extras[m.tmdb_id] : undefined}
                canDrag={false} onDelete={onDelete} onUnsee={onUnsee} onMarkSeen={onMarkSeen} />
            </View>
          )) : <Text style={styles.seenEmpty}>{t.seenEmpty}</Text>}
        </View>
      ) : null}
    </View>
  );

  const empty = (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{t.emptyTitle}</Text>
      <Text style={styles.emptyText}>{t.emptyBody}</Text>
    </View>
  );

  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.red} colors={[theme.red]} />;

  return (
    <Background>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.red} /></View>
      ) : sort === 'handmatig' ? (
        <DraggableFlatList
          data={watchOpen ? unseen : []}
          keyExtractor={(m) => m.id}
          renderItem={({ item, drag, isActive, getIndex }: RenderItemParams<MovieRow>) => (
            <ScaleDecorator>
              <MovieCard item={item} index={getIndex() ?? 0} title={displayTitle(item)} ex={item.tmdb_id ? extras[item.tmdb_id] : undefined}
                canDrag={!item.seen} drag={drag} isActive={isActive} onDelete={onDelete} onUnsee={onUnsee} onMarkSeen={onMarkSeen} />
            </ScaleDecorator>
          )}
          onDragEnd={onDragEnd}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          ListEmptyComponent={watchOpen ? empty : null}
          ItemSeparatorComponent={Separator}
          contentContainerStyle={styles.listContent}
          refreshControl={refreshControl}
        />
      ) : (
        <FlatList
          data={watchOpen ? unseen : []}
          keyExtractor={(m) => m.id}
          renderItem={({ item, index }) => (
            <MovieCard item={item} index={index} title={displayTitle(item)} ex={item.tmdb_id ? extras[item.tmdb_id] : undefined}
              canDrag={false} onDelete={onDelete} onUnsee={onUnsee} onMarkSeen={onMarkSeen} />
          )}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          ListEmptyComponent={watchOpen ? empty : null}
          ItemSeparatorComponent={Separator}
          contentContainerStyle={styles.listContent}
          refreshControl={refreshControl}
        />
      )}

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)}>
          <View style={styles.menu}>
            <Text style={styles.menuTitle}>{t.sortBy}</Text>
            {SORTS.map((s) => (
              <TouchableOpacity key={s.key} style={styles.menuItem} onPress={() => { setSort(s.key); setMenuOpen(false); }}>
                <Ionicons name={s.icon} size={18} color={sort === s.key ? theme.red : theme.textMuted} />
                <Text style={[styles.menuItemText, sort === s.key && { color: theme.red, fontWeight: '600' }]}>{s.label}</Text>
                {sort === s.key ? <Ionicons name="checkmark" size={18} color={theme.red} style={{ marginLeft: 'auto' }} /> : null}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal visible={seenMenuOpen} transparent animationType="fade" onRequestClose={() => setSeenMenuOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setSeenMenuOpen(false)}>
          <View style={styles.menu}>
            <Text style={styles.menuTitle}>{t.sortBy}</Text>
            {SEEN_SORTS.map((s) => (
              <TouchableOpacity key={s.key} style={styles.menuItem} onPress={() => { setSeenSort(s.key); setSeenMenuOpen(false); }}>
                <Text style={[styles.menuItemText, seenSort === s.key && { color: theme.red, fontWeight: '600' }]}>{s.label}</Text>
                {seenSort === s.key ? <Ionicons name="checkmark" size={18} color={theme.red} style={{ marginLeft: 'auto' }} /> : null}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal visible={!!ratingFor} transparent animationType="fade" onRequestClose={() => setRatingFor(null)}>
        <Pressable style={styles.backdrop} onPress={() => setRatingFor(null)}>
          <View style={styles.menu}>
            <Text style={styles.rateTitle}>{t.rateTitle}{'\n'}"{ratingFor ? displayTitle(ratingFor) : ''}"?</Text>
            <View style={styles.scoreGrid}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <TouchableOpacity key={n} style={styles.scoreBtn} onPress={() => chooseScore(n)}>
                  <Text style={styles.scoreText}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.skipBtn} onPress={() => chooseScore(null)}>
              <Text style={styles.skipText}>{t.rateSkip}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </Background>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 16, paddingTop: 8, paddingBottom: 32 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: theme.border },
  sectionTitle: { color: theme.text, fontSize: 19, fontWeight: '600' },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, marginBottom: 12, backgroundColor: theme.surface2, borderRadius: radius.md, paddingHorizontal: 14, height: 42, borderWidth: 1, borderColor: theme.border },
  sortBtnText: { color: theme.text, fontSize: 14, fontWeight: '500' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.surface, borderRadius: radius.md, padding: 10, borderWidth: 1, borderColor: theme.border },
  cardActive: { borderColor: theme.red, backgroundColor: theme.surface2 },
  rank: { width: 24, height: 24, borderRadius: 8, backgroundColor: theme.redSoft, alignItems: 'center', justifyContent: 'center' },
  rankText: { color: theme.red, fontWeight: '700', fontSize: 12 },
  poster: { width: 42, height: 60, borderRadius: 6, backgroundColor: theme.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  posterImg: { width: 42, height: 60 },
  title: { color: theme.text, fontSize: 15, fontWeight: '600' },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingText: { color: theme.gold, fontSize: 12, fontWeight: '600' },
  meta: { color: theme.textMuted, fontSize: 12 },
  logos: { flexDirection: 'row', gap: 5, marginTop: 6 },
  logo: { width: 22, height: 22, borderRadius: 5, backgroundColor: '#fff' },
  ourRatings: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  ourRating: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: theme.surface2, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  ourRatingText: { color: theme.text, fontSize: 11 },
  actionBtn: { width: 92, justifyContent: 'center', alignItems: 'center', borderRadius: radius.md },
  actionText: { color: '#fff', fontSize: 12, marginTop: 2 },
  seenHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.surface2, borderRadius: radius.md, paddingHorizontal: 14, height: 44, borderWidth: 1, borderColor: theme.border },
  seenHeaderText: { color: theme.text, fontSize: 14, fontWeight: '500' },
  seenSortRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  seenChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border },
  seenChipOn: { backgroundColor: theme.red, borderColor: theme.red },
  seenChipText: { color: theme.textMuted, fontSize: 12 },
  seenChipTextOn: { color: '#fff', fontWeight: '600' },
  seenEmpty: { color: theme.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 16 },
  empty: { alignItems: 'center', marginTop: 50, paddingHorizontal: 24 },
  emptyTitle: { color: theme.text, fontSize: 17, fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  emptyText: { color: theme.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 21 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 32 },
  menu: { backgroundColor: theme.surfaceOpaque, borderRadius: 16, padding: 8, borderWidth: 1, borderColor: theme.border },
  menuTitle: { color: theme.textMuted, fontSize: 12, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 14, borderRadius: 10 },
  menuItemText: { color: theme.text, fontSize: 15 },
  rateTitle: { color: theme.text, fontSize: 16, fontWeight: '600', textAlign: 'center', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 14, lineHeight: 22 },
  scoreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', paddingHorizontal: 8 },
  scoreBtn: { width: 52, height: 48, borderRadius: 10, backgroundColor: theme.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.border },
  scoreText: { color: theme.text, fontSize: 18, fontWeight: '600' },
  skipBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 8 },
  skipText: { color: theme.textMuted, fontSize: 14 },
});
