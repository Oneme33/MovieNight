import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
  Image, FlatList, RefreshControl, Modal, Pressable, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { TouchableOpacity as GHTouchable } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { theme, radius } from '../theme';
import { Background } from '../Background';
import { t } from '../i18n';
import { useSession } from '../ListContext';
import { supabase, MovieRow } from '../supabase';
import { fetchMovies, deleteMovie, persistOrder, markSeen, unmarkSeen } from '../db';
import { IMG, LOGO, getMovieExtras, MovieExtras, GENRE_OPTIONS, Length } from '../tmdb';
import { MovieDetails, DetailTarget } from '../MovieDetails';

type SortMode = 'nieuw' | 'waardering' | 'titel' | 'streaming' | 'lengte' | 'handmatig';
const SORTS: { key: SortMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'nieuw', label: t.sortNewest, icon: 'time-outline' },
  { key: 'waardering', label: t.sortRating, icon: 'star-outline' },
  { key: 'titel', label: t.sortTitle, icon: 'text-outline' },
  { key: 'streaming', label: t.sortStreaming, icon: 'tv-outline' },
  { key: 'lengte', label: t.sortLength, icon: 'hourglass-outline' },
  { key: 'handmatig', label: t.sortManual, icon: 'reorder-three-outline' },
];

const LENGTHS: { key: Length; label: string }[] = [
  { key: 'all', label: t.lenAll },
  { key: 'short', label: t.lenShort },
  { key: 'mid', label: t.lenMid },
  { key: 'long', label: t.lenLong },
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

// Swipe action whose opacity follows the swipe, so it's invisible at rest
// (nothing bleeds through the translucent card) and fades away cleanly on close.
function SwipeAction(props: {
  progress: SharedValue<number>;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  height: number;
  onPress: () => void;
}) {
  const style = useAnimatedStyle(() => ({ opacity: Math.min(props.progress.value, 1) }));
  return (
    <Animated.View style={style}>
      <GHTouchable
        style={[styles.actionBtn, { backgroundColor: props.color, height: props.height || undefined }]}
        onPress={props.onPress}
      >
        <Ionicons name={props.icon} size={22} color="#fff" />
        <Text style={styles.actionText}>{props.label}</Text>
      </GHTouchable>
    </Animated.View>
  );
}

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
  onOpen: (m: MovieRow) => void;
};

const MovieCard = React.memo(function MovieCard(p: CardProps) {
  const { item, index, title, ex, canDrag, drag, isActive } = p;
  const ratingPairs = Object.entries(item.ratings ?? {});
  const [rowH, setRowH] = useState(0);
  const swipeRef = useRef<any>(null);

  const rightActions = (progress: SharedValue<number>) => (
    <SwipeAction
      progress={progress} color={theme.red} icon="trash" label={t.actionDelete} height={rowH}
      onPress={() => { swipeRef.current?.close(); p.onDelete(item); }}
    />
  );
  const leftActions = (progress: SharedValue<number>) => (
    <SwipeAction
      progress={progress}
      color={item.seen ? theme.textFaint : theme.green}
      icon={item.seen ? 'arrow-undo' : 'checkmark-done'}
      label={item.seen ? t.actionBack : t.actionSeen}
      height={rowH}
      onPress={() => { swipeRef.current?.close(); item.seen ? p.onUnsee(item) : p.onMarkSeen(item); }}
    />
  );

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
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
        onPress={() => p.onOpen(item)}
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
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
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
  const [tab, setTab] = useState<'watch' | 'seen'>('watch');
  const [seenSort, setSeenSort] = useState<SeenSort>('datum');
  const [seenMenuOpen, setSeenMenuOpen] = useState(false);
  const [ratingFor, setRatingFor] = useState<MovieRow | null>(null);
  const [detailFor, setDetailFor] = useState<DetailTarget>(null);
  const [rouletteOpen, setRouletteOpen] = useState(false);
  const [countdown, setCountdown] = useState(20);
  const [rouletteResult, setRouletteResult] = useState<MovieRow | null>(null);
  const [fGenre, setFGenre] = useState<number | null>(null);
  const [fLength, setFLength] = useState<Length>('all');
  const [fKids, setFKids] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

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
    let arr = movies.filter((m) => !m.seen);

    // Filters (based on loaded movie details; unknown data stays visible except for kids).
    if (fLength !== 'all' || fGenre || fKids) {
      arr = arr.filter((m) => {
        const ex = m.tmdb_id ? extras[m.tmdb_id] : undefined;
        if (fLength !== 'all' && ex?.runtime != null) {
          if (fLength === 'short' && ex.runtime >= 60) return false;
          if (fLength === 'mid' && (ex.runtime < 60 || ex.runtime > 90)) return false;
          if (fLength === 'long' && ex.runtime < 90) return false;
        }
        if (fGenre && ex?.genreIds?.length && !ex.genreIds.includes(fGenre)) return false;
        if (fKids && !(ex?.certAge != null && ex.certAge <= 9)) return false;
        return true;
      });
    }

    if (sort === 'nieuw') arr.sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
    else if (sort === 'waardering') {
      const r = (m: MovieRow) => (m.tmdb_id && extras[m.tmdb_id]?.rating) || -1;
      arr.sort((a, b) => r(b) - r(a));
    } else if (sort === 'titel') arr.sort((a, b) => displayTitle(a).localeCompare(displayTitle(b), 'nl'));
    else if (sort === 'streaming') {
      const svc = (m: MovieRow) => (m.tmdb_id && extras[m.tmdb_id]?.ours[0]?.key) || '~';
      arr.sort((a, b) => svc(a).localeCompare(svc(b)) || displayTitle(a).localeCompare(displayTitle(b), 'nl'));
    } else if (sort === 'lengte') {
      const rt = (m: MovieRow) => (m.tmdb_id && extras[m.tmdb_id]?.runtime) || 9999;
      arr.sort((a, b) => rt(a) - rt(b));
    } else arr.sort((a, b) => a.position - b.position);
    return arr;
  }, [movies, sort, extras, displayTitle, fLength, fGenre, fKids]);

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

  const onOpen = useCallback((m: MovieRow) => {
    if (!m.tmdb_id) return;
    setDetailFor({ tmdb_id: m.tmdb_id, title: m.title, year: m.year, poster_path: m.poster_path });
  }, []);

  // Movie roulette: 20s countdown, then the app picks a random unseen movie.
  const pickRandom = useCallback(() => {
    if (!unseen.length) return;
    setRouletteResult(unseen[Math.floor(Math.random() * unseen.length)]);
  }, [unseen]);

  useEffect(() => {
    if (!rouletteOpen || rouletteResult) return;
    if (countdown <= 0) { pickRandom(); return; }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [rouletteOpen, rouletteResult, countdown, pickRandom]);

  const openRoulette = () => {
    setRouletteResult(null);
    setCountdown(20);
    setRouletteOpen(true);
  };

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

  const sortButton = (label: string, onPress: () => void) => (
    <TouchableOpacity style={styles.sortBtn} onPress={onPress} activeOpacity={0.8}>
      <Ionicons name="swap-vertical" size={16} color={theme.text} />
      <Text style={styles.sortBtnText}>{t.sortPrefix}{label}</Text>
      <Ionicons name="chevron-down" size={16} color={theme.textMuted} style={{ marginLeft: 'auto' }} />
    </TouchableOpacity>
  );

  const tabsBar = (
    <View style={styles.tabsBar}>
      <TouchableOpacity style={[styles.tab, tab === 'watch' && styles.tabOn]} onPress={() => setTab('watch')} activeOpacity={0.85}>
        <Ionicons name="film-outline" size={16} color={tab === 'watch' ? '#fff' : theme.textMuted} />
        <Text style={[styles.tabText, tab === 'watch' && styles.tabTextOn]}>{t.toWatch} ({unseen.length})</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.tab, tab === 'seen' && styles.tabOn]} onPress={() => setTab('seen')} activeOpacity={0.85}>
        <Ionicons name="eye-outline" size={16} color={tab === 'seen' ? '#fff' : theme.textMuted} />
        <Text style={[styles.tabText, tab === 'seen' && styles.tabTextOn]}>{t.seen} ({seen.length})</Text>
      </TouchableOpacity>
    </View>
  );

  const filterCount = (fGenre ? 1 : 0) + (fLength !== 'all' ? 1 : 0) + (fKids ? 1 : 0);

  const watchHeader = (
    <View style={styles.headerRow}>
      <View style={{ flex: 1 }}>{sortButton(current.label, () => setMenuOpen(true))}</View>
      <TouchableOpacity
        style={[styles.squareBtn, filterCount > 0 && styles.squareBtnOn]}
        onPress={() => setFilterOpen(true)} activeOpacity={0.85}
      >
        <Ionicons name="options-outline" size={20} color={filterCount > 0 ? '#fff' : theme.text} />
        {filterCount > 0 ? <View style={styles.badgeDot}><Text style={styles.badgeDotText}>{filterCount}</Text></View> : null}
      </TouchableOpacity>
      {unseen.length > 0 ? (
        <TouchableOpacity style={[styles.squareBtn, { backgroundColor: theme.red, borderColor: theme.red }]} onPress={openRoulette} activeOpacity={0.85}>
          <Ionicons name="dice-outline" size={22} color="#fff" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
  const seenHeader = sortButton(SEEN_SORTS.find((s) => s.key === seenSort)!.label, () => setSeenMenuOpen(true));

  const emptyWatch = (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{t.emptyTitle}</Text>
      <Text style={styles.emptyText}>{t.emptyBody}</Text>
    </View>
  );
  const emptySeen = (
    <View style={styles.empty}><Text style={styles.emptyText}>{t.seenEmpty}</Text></View>
  );

  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.red} colors={[theme.red]} />;

  const renderCard = (item: MovieRow, index: number) => (
    <MovieCard item={item} index={index} title={displayTitle(item)} ex={item.tmdb_id ? extras[item.tmdb_id] : undefined}
      canDrag={false} onDelete={onDelete} onUnsee={onUnsee} onMarkSeen={onMarkSeen} onOpen={onOpen} />
  );

  return (
    <Background>
      {tabsBar}
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.red} /></View>
      ) : tab === 'watch' ? (
        sort === 'handmatig' ? (
          <DraggableFlatList
            data={unseen}
            keyExtractor={(m) => m.id}
            renderItem={({ item, drag, isActive, getIndex }: RenderItemParams<MovieRow>) => (
              <ScaleDecorator>
                <MovieCard item={item} index={getIndex() ?? 0} title={displayTitle(item)} ex={item.tmdb_id ? extras[item.tmdb_id] : undefined}
                  canDrag drag={drag} isActive={isActive} onDelete={onDelete} onUnsee={onUnsee} onMarkSeen={onMarkSeen} onOpen={onOpen} />
              </ScaleDecorator>
            )}
            onDragEnd={onDragEnd}
            ListHeaderComponent={watchHeader}
            ListEmptyComponent={emptyWatch}
            ItemSeparatorComponent={Separator}
            contentContainerStyle={styles.listContent}
            refreshControl={refreshControl}
          />
        ) : (
          <FlatList
            data={unseen}
            keyExtractor={(m) => m.id}
            renderItem={({ item, index }) => renderCard(item, index)}
            ListHeaderComponent={watchHeader}
            ListEmptyComponent={emptyWatch}
            ItemSeparatorComponent={Separator}
            contentContainerStyle={styles.listContent}
            refreshControl={refreshControl}
          />
        )
      ) : (
        <FlatList
          data={seen}
          keyExtractor={(m) => m.id}
          renderItem={({ item, index }) => renderCard(item, index)}
          ListHeaderComponent={seenHeader}
          ListEmptyComponent={emptySeen}
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
              {[[1, 2, 3, 4, 5], [6, 7, 8, 9, 10]].map((row, ri) => (
                <View key={ri} style={styles.scoreRow}>
                  {row.map((n) => (
                    <TouchableOpacity key={n} style={styles.scoreBtn} onPress={() => chooseScore(n)}>
                      <Text style={styles.scoreText}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </View>
            <TouchableOpacity style={styles.skipBtn} onPress={() => chooseScore(null)}>
              <Text style={styles.skipText}>{t.rateSkip}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={rouletteOpen} transparent animationType="fade" onRequestClose={() => setRouletteOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.rouletteSheet}>
            <Text style={styles.rouletteTitle}>{t.randomTitle}</Text>
            {!rouletteResult ? (
              <>
                <Text style={styles.rouletteCount}>{countdown}</Text>
                <Text style={styles.rouletteHint}>{t.randomHint}</Text>
                <View style={styles.rouletteBtns}>
                  <TouchableOpacity style={styles.rouletteGhost} onPress={() => setRouletteOpen(false)}>
                    <Text style={styles.rouletteGhostText}>{t.cancel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.roulettePrimary} onPress={pickRandom}>
                    <Ionicons name="dice" size={18} color="#fff" />
                    <Text style={styles.roulettePrimaryText}>{t.randomNow}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.rouletteHint}>{t.randomResult}</Text>
                <View style={styles.resultPoster}>
                  {rouletteResult.poster_path ? (
                    <Image source={{ uri: IMG(rouletteResult.poster_path, 'w342')! }} style={styles.resultPosterImg} />
                  ) : (
                    <Ionicons name="film-outline" size={40} color={theme.textFaint} />
                  )}
                </View>
                <Text style={styles.resultTitle}>{displayTitle(rouletteResult)}</Text>
                {rouletteResult.year ? <Text style={styles.rouletteHint}>{rouletteResult.year}</Text> : null}
                <View style={styles.rouletteBtns}>
                  <TouchableOpacity style={styles.rouletteGhost} onPress={() => { setRouletteResult(null); setCountdown(20); }}>
                    <Ionicons name="refresh" size={16} color={theme.text} />
                    <Text style={styles.rouletteGhostText}>{t.randomAgain}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.roulettePrimary} onPress={() => setRouletteOpen(false)}>
                    <Text style={styles.roulettePrimaryText}>{t.close}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={filterOpen} transparent animationType="fade" onRequestClose={() => setFilterOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setFilterOpen(false)}>
          <Pressable style={styles.filterSheet}>
            <View style={styles.filterHeaderRow}>
              <Text style={styles.filterHeader}>{t.filters}</Text>
              <TouchableOpacity onPress={() => { setFGenre(null); setFLength('all'); setFKids(false); }}>
                <Text style={styles.clearText}>{t.clear}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.filterLabel}>{t.lengthLabel}</Text>
            <View style={styles.wrapRow}>
              {LENGTHS.map((l) => (
                <TouchableOpacity key={l.key} style={[styles.fChip, fLength === l.key && styles.fChipOn]} onPress={() => setFLength(l.key)}>
                  <Text style={[styles.fChipText, fLength === l.key && styles.fChipTextOn]}>{l.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.kidsRow}>
              <Text style={styles.filterLabel}>{t.kids}</Text>
              <Switch value={fKids} onValueChange={setFKids} trackColor={{ true: theme.red, false: theme.surface2 }} thumbColor="#fff" />
            </View>

            <Text style={styles.filterLabel}>{t.genreLabel}</Text>
            <View style={styles.wrapRow}>
              {GENRE_OPTIONS.map((g) => {
                const on = fGenre === g.id;
                return (
                  <TouchableOpacity key={g.id} style={[styles.fChip, on && styles.fChipOn]} onPress={() => setFGenre(on ? null : g.id)}>
                    <Text style={[styles.fChipText, on && styles.fChipTextOn]}>{g.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={styles.applyBtn} onPress={() => setFilterOpen(false)}>
              <Text style={styles.applyText}>{t.apply}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <MovieDetails target={detailFor} lang={titleLang} onClose={() => setDetailFor(null)} />
    </Background>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 16, paddingTop: 8, paddingBottom: 32 },
  tabsBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42, borderRadius: radius.md, backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border },
  tabOn: { backgroundColor: theme.red, borderColor: theme.red },
  tabText: { color: theme.textMuted, fontSize: 14, fontWeight: '500' },
  tabTextOn: { color: '#fff' },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  squareBtn: {
    width: 42, height: 42, borderRadius: radius.md, backgroundColor: theme.surface2,
    borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center', marginTop: 10,
  },
  squareBtnOn: { backgroundColor: theme.red, borderColor: theme.red },
  badgeDot: {
    position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeDotText: { color: theme.red, fontSize: 11, fontWeight: '700' },
  filterSheet: { backgroundColor: theme.surfaceOpaque, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.border },
  filterHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  filterHeader: { color: theme.text, fontSize: 17, fontWeight: '600' },
  clearText: { color: theme.red, fontSize: 14 },
  filterLabel: { color: theme.textMuted, fontSize: 13, marginBottom: 8, marginTop: 10 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border },
  fChipOn: { backgroundColor: theme.red, borderColor: theme.red },
  fChipText: { color: theme.textMuted, fontSize: 13 },
  fChipTextOn: { color: '#fff', fontWeight: '600' },
  kidsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  applyBtn: { marginTop: 18, backgroundColor: theme.red, borderRadius: radius.md, height: 48, alignItems: 'center', justifyContent: 'center' },
  applyText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  rouletteSheet: { backgroundColor: theme.surfaceOpaque, borderRadius: 16, padding: 22, borderWidth: 1, borderColor: theme.border, alignItems: 'center' },
  rouletteTitle: { color: theme.text, fontSize: 30, fontFamily: 'BebasNeue_400Regular', letterSpacing: 3 },
  rouletteCount: { color: theme.red, fontSize: 84, fontFamily: 'BebasNeue_400Regular', marginVertical: 6 },
  rouletteHint: { color: theme.textMuted, fontSize: 14, textAlign: 'center', marginTop: 2 },
  rouletteBtns: { flexDirection: 'row', gap: 10, marginTop: 20, alignSelf: 'stretch' },
  rouletteGhost: { flex: 1, flexDirection: 'row', gap: 6, height: 48, borderRadius: radius.md, backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
  rouletteGhostText: { color: theme.text, fontSize: 15, fontWeight: '500' },
  roulettePrimary: { flex: 1, flexDirection: 'row', gap: 6, height: 48, borderRadius: radius.md, backgroundColor: theme.red, alignItems: 'center', justifyContent: 'center' },
  roulettePrimaryText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  resultPoster: { width: 150, height: 222, borderRadius: 12, backgroundColor: theme.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginTop: 14 },
  resultPosterImg: { width: 150, height: 222 },
  resultTitle: { color: theme.text, fontSize: 19, fontWeight: '700', textAlign: 'center', marginTop: 12 },
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
  scoreGrid: { paddingHorizontal: 8 },
  scoreRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 10 },
  scoreBtn: { width: 50, height: 48, borderRadius: 10, backgroundColor: theme.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.border },
  scoreText: { color: theme.text, fontSize: 18, fontWeight: '600' },
  skipBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 8 },
  skipText: { color: theme.textMuted, fontSize: 14 },
});
