import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Image, FlatList, RefreshControl, Modal, Pressable, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { TouchableOpacity as GHTouchable } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle, type SharedValue,
  FadeIn, FadeOut, FadeInDown, SlideOutRight, SlideOutLeft, LinearTransition, ZoomIn,
} from 'react-native-reanimated';
import ConfettiCannon from 'react-native-confetti-cannon';
import { Dimensions } from 'react-native';
import { hTap, hMedium, hHeavy, hSuccess, hWarn, hSelect } from '../haptics';
import { theme, radius } from '../theme';
import { Background } from '../Background';
import { t } from '../i18n';
import { useSession } from '../ListContext';
import { supabase, MovieRow } from '../supabase';
import { fetchMovies, deleteMovie, persistOrder, markSeen, unmarkSeen, setHype, hypeOf } from '../db';
import { IMG, LOGO, loadExtrasBatched, MovieExtras, Length, LENGTH_OPTIONS, matchesLength, GenreFilter, NO_GENRES, matchesGenres } from '../tmdb';
import { GenreDropdown } from '../GenreDropdown';
import { SkeletonList } from '../Loader';
import { computeTasteMatch, TasteMatchCard, TasteMatchModal } from '../TasteMatch';
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

const Separator = () => <View style={{ height: 12 }} />;

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

// Poster tile for the grid view; actions go through the ⋯ button (same pattern as For You).
const GRID_W = Math.floor((Dimensions.get('window').width - 32 - 20) / 3);

function GridCard({ item, title, ex, onOpen, onAction, myName }: {
  item: MovieRow; title: string; ex?: MovieExtras;
  onOpen: (m: MovieRow) => void; onAction: (m: MovieRow) => void; myName?: string;
}) {
  const poster = item.poster_path ? IMG(item.poster_path, 'w342') : null;
  const myAvg = avg(item.ratings);
  return (
    <TouchableOpacity style={gc.wrap} onPress={() => onOpen(item)} onLongPress={() => onAction(item)} delayLongPress={280} activeOpacity={0.85}>
      <View style={gc.poster}>
        {poster ? (
          <Image source={{ uri: poster }} style={gc.posterImg} />
        ) : (
          <View style={gc.posterEmpty}><Ionicons name="film-outline" size={26} color={theme.textFaint} /></View>
        )}
        {item.seen && myAvg > 0 ? (
          <View style={gc.badge}>
            <Ionicons name="person" size={9} color={theme.gold} />
            <Text style={gc.badgeText}>{Math.round(myAvg * 10) / 10}</Text>
          </View>
        ) : ex?.rating != null ? (
          <View style={gc.badge}>
            <Ionicons name="star" size={9} color={theme.gold} />
            <Text style={gc.badgeText}>{ex.rating.toFixed(1)}</Text>
          </View>
        ) : null}
        {!item.seen && hypeOf(item, myName).both ? (
          <Animated.View entering={ZoomIn.springify()} style={gc.flame}>
            <Ionicons name="flame" size={14} color={theme.flame} />
          </Animated.View>
        ) : null}
        <TouchableOpacity style={gc.action} onPress={() => onAction(item)}>
          <Ionicons name="ellipsis-horizontal" size={15} color={theme.red} />
        </TouchableOpacity>
      </View>
      <Text style={gc.title} numberOfLines={2}>{title}</Text>
    </TouchableOpacity>
  );
}

const gc = StyleSheet.create({
  wrap: { width: GRID_W },
  poster: {
    width: GRID_W, height: Math.floor(GRID_W * 1.48), borderRadius: 10,
    backgroundColor: theme.surface2, overflow: 'hidden', borderWidth: 1, borderColor: theme.border,
  },
  posterImg: { width: GRID_W, height: Math.floor(GRID_W * 1.48) },
  posterEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute', top: 5, left: 5, flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(12,8,7,0.75)', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 2,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  action: {
    position: 'absolute', bottom: 5, right: 5, width: 26, height: 26, borderRadius: 8,
    borderWidth: 1.5, borderColor: theme.red, backgroundColor: 'rgba(12,8,7,0.72)',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { color: theme.textMuted, fontSize: 11, lineHeight: 15, marginTop: 5 },
  flame: {
    position: 'absolute', top: 5, right: 5, width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(12,8,7,0.8)', borderWidth: 1, borderColor: theme.flame,
    alignItems: 'center', justifyContent: 'center',
  },
});

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
  onRate: (m: MovieRow) => void;
  onHype: (m: MovieRow) => void;
  myName?: string;
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
            {ex?.genres?.[0] ? <Text style={styles.meta}>· {ex.genres[0]}</Text> : null}
            {ex?.runtime ? <Text style={styles.meta}>· {ex.runtime} min</Text> : null}
          </View>
          {item.seen ? (
            <View style={styles.ourRatings}>
              {ratingPairs.map(([name, score]) => {
                const mine = name === p.myName;
                return (
                  <TouchableOpacity
                    key={name}
                    style={styles.ourRating}
                    disabled={!mine}
                    onPress={() => p.onRate(item)}
                  >
                    <Ionicons name="person" size={10} color={theme.textMuted} />
                    <Text style={styles.ourRatingText}>{name}: {score}</Text>
                    {mine ? <Ionicons name="pencil" size={9} color={theme.textFaint} /> : null}
                  </TouchableOpacity>
                );
              })}
              {p.myName && !(item.ratings ?? {})[p.myName] ? (
                <TouchableOpacity style={[styles.ourRating, styles.rateChip]} onPress={() => p.onRate(item)}>
                  <Ionicons name="star-outline" size={10} color={theme.gold} />
                  <Text style={styles.rateChipText}>{t.giveRating}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (ex?.ours?.length || item.added_by) ? (
            <View style={styles.logos}>
              {ex?.ours?.map((pr) => { const l = LOGO(pr.logo_path); return l ? <Image key={pr.key} source={{ uri: l }} style={styles.logo} /> : null; })}
              {item.added_by ? (
                <View style={styles.byChip}>
                  <Ionicons name="person-outline" size={9} color={theme.textFaint} />
                  <Text style={styles.byChipText}>{item.added_by}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
        {!item.seen ? (() => {
          const h = hypeOf(item, p.myName);
          return (
            <TouchableOpacity
              style={[styles.hypeBtn, h.both && styles.hypeBtnMatch]} onPress={() => p.onHype(item)}
              hitSlop={8} accessibilityLabel={h.mine ? t.hypeOff : t.hypeOn}
            >
              <Animated.View key={h.both ? 'match' : 'single'} entering={h.both ? ZoomIn.springify() : undefined}>
                <Ionicons
                  name={h.mine || h.both ? 'flame' : 'flame-outline'} size={h.both ? 20 : 18}
                  color={h.both ? theme.flame : h.mine ? 'rgba(255,122,26,0.7)' : theme.textFaint}
                />
              </Animated.View>
            </TouchableOpacity>
          );
        })() : null}
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
  const [countdown, setCountdown] = useState(10);
  const [rouletteResult, setRouletteResult] = useState<MovieRow | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [spinIdx, setSpinIdx] = useState(0);
  const spinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fGenres, setFGenres] = useState<GenreFilter>(NO_GENRES);
  const [fLength, setFLength] = useState<Length>('all');
  const [fKids, setFKids] = useState(false);
  const [fHype, setFHype] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [gridActionFor, setGridActionFor] = useState<MovieRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [tasteOpen, setTasteOpen] = useState(false);
  const [newsMsg, setNewsMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const newsChecked = useRef(false);

  const showToast = useCallback((msg: string) => {
    hTap();
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const moviesRef = useRef(movies);
  moviesRef.current = movies;

  // In-app notification when the partner adds or rates a movie while the app is open.
  const onRealtime = useCallback((payload: any) => {
    const me = session?.memberName;
    if (!me) return;
    if (payload.eventType === 'INSERT') {
      const n = payload.new as MovieRow;
      if (n?.added_by && n.added_by !== me && n.title) showToast(t.partnerAdded(n.added_by, n.title));
    } else if (payload.eventType === 'UPDATE') {
      const n = payload.new as MovieRow;
      const oldR = ((payload.old?.ratings as Record<string, number>) ?? {});
      const newR = n?.ratings ?? {};
      for (const [name, score] of Object.entries(newR)) {
        if (name !== me && oldR[name] !== score) { showToast(t.partnerRated(name, n.title, score)); break; }
      }
      // Our own votes are applied locally first, so this only fires for the partner's.
      const before = moviesRef.current.find((m) => m.id === n?.id);
      if (n && !n.seen && before && !hypeOf(before).both && hypeOf(n).both) {
        hSuccess();
        showToast(t.hypeMatch(n.title));
      }
    }
  }, [session, showToast]);

  // Remember the chosen view.
  useEffect(() => {
    AsyncStorage.getItem('filmavond.viewMode').then((v) => {
      if (v === 'grid' || v === 'list') setViewMode(v);
    }).catch(() => {});
  }, []);
  const toggleView = () => {
    hSelect();
    const next = viewMode === 'list' ? 'grid' : 'list';
    setViewMode(next);
    AsyncStorage.setItem('filmavond.viewMode', next).catch(() => {});
  };

  // Offline cache: hydrate instantly from the last known list, refresh from the network after.
  useEffect(() => {
    if (!session) return;
    AsyncStorage.getItem(`filmavond.movies.${session.listId}`).then((raw) => {
      if (!raw) return;
      const cached: MovieRow[] = JSON.parse(raw);
      setMovies((prev) => (prev.length ? prev : cached));
      setLoading(false);
    }).catch(() => {});
  }, [session]);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const ms = await fetchMovies(session.listId);
      setMovies(ms);
      AsyncStorage.setItem(`filmavond.movies.${session.listId}`, JSON.stringify(ms)).catch(() => {});

      // Catch-up banner: computed once per app open, from fresh server data
      // (never from the offline cache, so late-arriving movies aren't missed).
      if (!newsChecked.current) {
        newsChecked.current = true;
        const key = `filmavond.lastSeen.${session.listId}`;
        const prev = await AsyncStorage.getItem(key).catch(() => null);
        AsyncStorage.setItem(key, new Date().toISOString()).catch(() => {});
        if (prev) {
          const prevT = Date.parse(prev);
          const me = session.memberName;
          const news = ms.filter((m) => m.added_by && m.added_by !== me && Date.parse(m.created_at) > prevT);
          if (news.length) setNewsMsg(t.catchUp(news[0].added_by!, news.length));
        }
      }
    } catch {
      // Offline or transient error: keep showing the cached list.
    } finally { setLoading(false); }
  }, [session]);

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel(`movies-${session.listId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'movies', filter: `list_id=eq.${session.listId}` },
        (payload: any) => { onRealtime(payload); load(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session, load, onRealtime]);


  useFocusEffect(useCallback(() => { load(); }, [load]));
  // Each movie's extras are requested once per title language; results arrive in batches.
  const requested = useRef<Set<string>>(new Set());
  const langRef = useRef(titleLang);
  useEffect(() => { langRef.current = titleLang; setExtras({}); }, [titleLang]);
  useEffect(() => {
    const ids = movies
      .map((m) => m.tmdb_id)
      .filter((id): id is number => !!id && !requested.current.has(`${id}:${titleLang}`));
    if (!ids.length) return;
    ids.forEach((id) => requested.current.add(`${id}:${titleLang}`));
    const lang = titleLang;
    loadExtrasBatched(
      ids, lang,
      (batch) => { if (langRef.current === lang) setExtras((prev) => ({ ...prev, ...batch })); },
      (id) => requested.current.delete(`${id}:${lang}`),
    );
  }, [movies, titleLang]);

  const displayTitle = useCallback(
    (m: MovieRow) => (m.tmdb_id && extras[m.tmdb_id]?.title) || m.title,
    [extras]
  );

  const unseen = useMemo(() => {
    let arr = movies.filter((m) => !m.seen);

    // Filters combine as AND; movies whose data is unknown are excluded while a filter is active.
    if (fHype) arr = arr.filter((m) => hypeOf(m).both);
    if (fLength !== 'all' || fGenres.ids.length || fKids) {
      arr = arr.filter((m) => {
        const ex = m.tmdb_id ? extras[m.tmdb_id] : undefined;
        if (fLength !== 'all') {
          const rt = ex?.runtime;
          if (rt == null || !matchesLength(rt, fLength)) return false;
        }
        if (!matchesGenres(ex?.genreIds, fGenres)) return false;
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
  }, [movies, sort, extras, displayTitle, fLength, fGenres, fKids, fHype]);

  const seen = useMemo(() => {
    const arr = movies.filter((m) => m.seen);
    if (seenSort === 'titel') arr.sort((a, b) => displayTitle(a).localeCompare(displayTitle(b), 'nl'));
    else if (seenSort === 'cijfer') arr.sort((a, b) => avg(b.ratings) - avg(a.ratings));
    else arr.sort((a, b) => ((b.seen_at ?? '') > (a.seen_at ?? '') ? 1 : -1));
    return arr;
  }, [movies, seenSort, extras, displayTitle]);

  const taste = useMemo(
    () => computeTasteMatch(movies, session?.memberName, extras),
    [movies, session?.memberName, extras]
  );

  const patch = (id: string, fields: Partial<MovieRow>) =>
    setMovies((prev) => prev.map((m) => (m.id === id ? { ...m, ...fields } : m)));

  const onDelete = useCallback((m: MovieRow) => {
    hWarn();
    setMovies((prev) => prev.filter((x) => x.id !== m.id));
    deleteMovie(m.id).catch(() => load());
  }, [load]);

  const onUnsee = useCallback((m: MovieRow) => {
    hTap();
    patch(m.id, { seen: false, seen_at: null });
    unmarkSeen(m.id).catch(() => load());
  }, [load]);

  const onMarkSeen = useCallback((m: MovieRow) => { hTap(); setRatingFor(m); }, []);

  const onHype = useCallback((m: MovieRow) => {
    const me = session?.memberName;
    if (!me) return;
    const on = !hypeOf(m, me).mine;
    const hype = { ...(m.hype ?? {}) };
    if (on) hype[me] = true; else delete hype[me];
    const next = { ...m, hype };
    patch(m.id, { hype });
    if (hypeOf(next, me).both && !hypeOf(m, me).both) { hSuccess(); showToast(t.hypeMatch(m.title)); }
    else hSelect();
    setHype(m.id, me, on)
      .then((h) => patch(m.id, { hype: h }))
      .catch(() => { patch(m.id, { hype: m.hype ?? {} }); showToast(t.hypeFailed); });
  }, [session, showToast]);

  const onOpen = useCallback((m: MovieRow) => {
    if (!m.tmdb_id) return;
    setDetailFor({ tmdb_id: m.tmdb_id, title: m.title, year: m.year, poster_path: m.poster_path });
  }, []);

  // Movie roulette: 10s countdown → slot-machine spin that decelerates onto the winner.
  const startSpin = useCallback(() => {
    if (!unseen.length || spinning) return;
    setSpinning(true);
    setCountdown((c) => Math.min(c, 3)); // spin covers the final 3 seconds
    hMedium();
    const winnerIdx = Math.floor(Math.random() * unseen.length);
    const winner = unseen[winnerIdx];
    // Crescendo: start slow, accelerate to a blur, then burst into the reveal.
    const delays = [500, 420, 350, 290, 240, 200, 165, 135, 110, 95, 82, 72, 65, 60, 58, 56, 55, 55];
    let i = 0;
    const step = () => {
      setSpinIdx((p) => p + 1);
      if (delays[i] <= 140) hTap(); // ticks intensify as it speeds up
      if (i < delays.length) {
        spinTimer.current = setTimeout(step, delays[i++]);
      } else {
        setSpinIdx(winnerIdx);
        setRouletteResult(winner);
        setSpinning(false);
        hSuccess();
      }
    };
    step();
  }, [unseen, spinning]);

  // Gentle poster carousel while the countdown runs (teases the candidates).
  useEffect(() => {
    if (!rouletteOpen || rouletteResult || spinning) return;
    const iv = setInterval(() => setSpinIdx((p) => p + 1), 450);
    return () => clearInterval(iv);
  }, [rouletteOpen, rouletteResult, spinning]);

  useEffect(() => {
    if (!rouletteOpen || rouletteResult) return;
    if (countdown === 3 && !spinning) startSpin(); // acceleration kicks in at 3…
    if (countdown <= 0) return; // …and the reveal lands exactly on 0
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [rouletteOpen, rouletteResult, spinning, countdown, startSpin]);

  // Final countdown you can feel: 5 → one light tap … 1 → five heavy thumps, then the reveal.
  useEffect(() => {
    if (!rouletteOpen || rouletteResult || countdown < 1 || countdown > 5) return;
    const hit = countdown >= 4 ? hTap : countdown >= 2 ? hMedium : hHeavy;
    const timers = Array.from({ length: 6 - countdown }, (_, i) => setTimeout(hit, i * 90));
    return () => timers.forEach(clearTimeout);
  }, [countdown, rouletteOpen, rouletteResult]);

  const openRoulette = () => {
    hMedium();
    if (spinTimer.current) clearTimeout(spinTimer.current);
    setSpinning(false);
    setSpinIdx(0);
    setRouletteResult(null);
    setCountdown(10);
    setRouletteOpen(true);
  };

  const closeRoulette = () => {
    if (spinTimer.current) clearTimeout(spinTimer.current);
    setSpinning(false);
    setRouletteOpen(false);
  };

  const onDragEnd = ({ data }: { data: MovieRow[] }) => {
    persistOrder(data).catch(() => load());
    setMovies((prev) => [...data, ...prev.filter((m) => m.seen)]);
  };

  const chooseScore = (score: number | null) => {
    const m = ratingFor;
    setRatingFor(null);
    if (!m || !session) return;
    if (score != null) hSuccess(); else hTap();
    const ratings = { ...(m.ratings ?? {}) };
    if (score != null) ratings[session.memberName] = score; else delete ratings[session.memberName];
    patch(m.id, { seen: true, seen_at: m.seen_at ?? new Date().toISOString(), ratings });
    markSeen(m, session.memberName, score).catch(() => load());
  };

  const current = SORTS.find((s) => s.key === sort)!;

  const sortButton = (label: string, onPress: () => void) => (
    <TouchableOpacity style={styles.sortBtn} onPress={onPress} activeOpacity={0.8}>
      <Ionicons name="swap-vertical" size={16} color={theme.text} />
      <Text style={styles.sortBtnText} numberOfLines={1}>{label}</Text>
      <Ionicons name="chevron-down" size={16} color={theme.textMuted} />
    </TouchableOpacity>
  );

  const tabsBar = (
    <View style={styles.tabsBar}>
      <TouchableOpacity style={[styles.tab, tab === 'watch' && styles.tabOn]} onPress={() => { hSelect(); setTab('watch'); }} activeOpacity={0.85}>
        <Ionicons name="film-outline" size={16} color={tab === 'watch' ? '#fff' : theme.textMuted} />
        <Text style={[styles.tabText, tab === 'watch' && styles.tabTextOn]}>{t.toWatch} ({unseen.length})</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.tab, tab === 'seen' && styles.tabOn]} onPress={() => { hSelect(); setTab('seen'); }} activeOpacity={0.85}>
        <Ionicons name="eye-outline" size={16} color={tab === 'seen' ? '#fff' : theme.textMuted} />
        <Text style={[styles.tabText, tab === 'seen' && styles.tabTextOn]}>{t.seen} ({seen.length})</Text>
      </TouchableOpacity>
    </View>
  );

  const filterCount = (fGenres.ids.length ? 1 : 0) + (fLength !== 'all' ? 1 : 0) + (fKids ? 1 : 0) + (fHype ? 1 : 0);

  const viewToggleBtn = (
    <TouchableOpacity style={styles.squareBtn} onPress={toggleView} activeOpacity={0.85}>
      <Ionicons name={viewMode === 'list' ? 'grid-outline' : 'list-outline'} size={19} color={theme.text} />
    </TouchableOpacity>
  );

  const watchHeader = (
    <View style={styles.headerRow}>
      <View style={{ flex: 1 }}>{sortButton(current.label, () => setMenuOpen(true))}</View>
      {viewToggleBtn}
      <TouchableOpacity
        style={[styles.squareBtn, filterCount > 0 && styles.squareBtnOn]}
        onPress={() => setFilterOpen(true)} activeOpacity={0.85}
      >
        <Ionicons name="options-outline" size={20} color={filterCount > 0 ? '#fff' : theme.text} />
        {filterCount > 0 ? <View style={styles.badgeDot}><Text style={styles.badgeDotText}>{filterCount}</Text></View> : null}
      </TouchableOpacity>
    </View>
  );
  const seenHeader = (
    <View>
      <TasteMatchCard match={taste} onPress={() => { hTap(); setTasteOpen(true); }} />
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>{sortButton(SEEN_SORTS.find((s) => s.key === seenSort)!.label, () => setSeenMenuOpen(true))}</View>
        {viewToggleBtn}
      </View>
    </View>
  );

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
      canDrag={false} onDelete={onDelete} onUnsee={onUnsee} onMarkSeen={onMarkSeen} onOpen={onOpen}
      onRate={onMarkSeen} onHype={onHype} myName={session?.memberName} />
  );

  return (
    <Background>
      {tabsBar}
      {newsMsg ? (
        <Animated.View entering={FadeInDown.duration(250)} style={styles.newsBanner}>
          <Ionicons name="notifications-outline" size={16} color={theme.red} />
          <Text style={styles.newsText} numberOfLines={2}>{newsMsg}</Text>
          <TouchableOpacity onPress={() => setNewsMsg(null)} style={{ padding: 4 }}>
            <Ionicons name="close" size={16} color={theme.textMuted} />
          </TouchableOpacity>
        </Animated.View>
      ) : null}
      {loading ? (
        <SkeletonList variant={viewMode} />
      ) : viewMode === 'grid' ? (
        <FlatList
          key={`grid-${tab}`}
          data={tab === 'watch' ? unseen : seen}
          keyExtractor={(m) => m.id}
          numColumns={3}
          columnWrapperStyle={{ gap: 10 }}
          renderItem={({ item }) => (
            <GridCard
              item={item}
              title={displayTitle(item)}
              ex={item.tmdb_id ? extras[item.tmdb_id] : undefined}
              onOpen={onOpen}
              onAction={(m) => { hTap(); setGridActionFor(m); }}
              myName={session?.memberName}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
          ListHeaderComponent={tab === 'watch' ? watchHeader : seenHeader}
          ListEmptyComponent={tab === 'watch' ? emptyWatch : emptySeen}
          contentContainerStyle={styles.listContent}
          refreshControl={refreshControl}
        />
      ) : tab === 'watch' ? (
        sort === 'handmatig' ? (
          <DraggableFlatList
            data={unseen}
            keyExtractor={(m) => m.id}
            renderItem={({ item, drag, isActive, getIndex }: RenderItemParams<MovieRow>) => (
              <ScaleDecorator>
                <MovieCard item={item} index={getIndex() ?? 0} title={displayTitle(item)} ex={item.tmdb_id ? extras[item.tmdb_id] : undefined}
                  canDrag drag={drag} isActive={isActive} onDelete={onDelete} onUnsee={onUnsee} onMarkSeen={onMarkSeen} onOpen={onOpen}
                  onRate={onMarkSeen} onHype={onHype} myName={session?.memberName} />
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
          <Animated.FlatList
            data={unseen}
            keyExtractor={(m: MovieRow) => m.id}
            renderItem={({ item, index }: { item: MovieRow; index: number }) => (
              <Animated.View entering={FadeInDown.duration(220)} exiting={SlideOutRight.duration(240)}>
                {renderCard(item, index)}
              </Animated.View>
            )}
            itemLayoutAnimation={LinearTransition.duration(180)}
            ListHeaderComponent={watchHeader}
            ListEmptyComponent={emptyWatch}
            ItemSeparatorComponent={Separator}
            contentContainerStyle={styles.listContent}
            refreshControl={refreshControl}
          />
        )
      ) : (
        <Animated.FlatList
          data={seen}
          keyExtractor={(m: MovieRow) => m.id}
          renderItem={({ item, index }: { item: MovieRow; index: number }) => (
            <Animated.View entering={FadeInDown.duration(220)} exiting={SlideOutLeft.duration(240)}>
              {renderCard(item, index)}
            </Animated.View>
          )}
          itemLayoutAnimation={LinearTransition.duration(180)}
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

      {tab === 'watch' && unseen.length > 0 && !loading ? (
        <TouchableOpacity style={styles.fab} onPress={openRoulette} activeOpacity={0.85}>
          <Ionicons name="dice-outline" size={26} color="#fff" />
        </TouchableOpacity>
      ) : null}

      {toast ? (
        <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOut.duration(200)} style={styles.toast} pointerEvents="none">
          <Ionicons name="notifications" size={14} color={theme.red} />
          <Text style={styles.toastText} numberOfLines={2}>{toast}</Text>
        </Animated.View>
      ) : null}

      <Modal visible={rouletteOpen} transparent animationType="fade" onRequestClose={closeRoulette}>
        <View style={styles.backdrop}>
          {rouletteResult ? (
            <ConfettiCannon
              count={100}
              origin={{ x: Dimensions.get('window').width / 2, y: -10 }}
              fadeOut
              explosionSpeed={350}
              fallSpeed={2600}
            />
          ) : null}
          <View style={styles.rouletteSheet}>
            <Text style={styles.rouletteTitle}>{t.randomTitle}</Text>
            {!rouletteResult ? (
              <>
                <View style={styles.spinFrame}>
                  {unseen.length ? (() => {
                    const m = unseen[spinIdx % unseen.length];
                    return (
                      <Animated.View key={spinIdx} entering={FadeIn.duration(80)}>
                        {m.poster_path ? (
                          <Image source={{ uri: IMG(m.poster_path, 'w342')! }} style={styles.spinPoster} />
                        ) : (
                          <View style={[styles.spinPoster, styles.spinPosterEmpty]}>
                            <Ionicons name="film-outline" size={36} color={theme.textFaint} />
                          </View>
                        )}
                      </Animated.View>
                    );
                  })() : null}
                </View>
                <Text style={styles.rouletteCount}>{countdown}</Text>
                <Text style={styles.rouletteHint}>{t.randomHint}</Text>
                {!spinning ? (
                  <View style={styles.rouletteBtns}>
                    <TouchableOpacity style={styles.rouletteGhost} onPress={closeRoulette}>
                      <Text style={styles.rouletteGhostText}>{t.cancel}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.roulettePrimary} onPress={startSpin}>
                      <Ionicons name="dice" size={18} color="#fff" />
                      <Text style={styles.roulettePrimaryText}>{t.randomNow}</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <Text style={styles.rouletteHint}>{t.randomResult}</Text>
                <Animated.View entering={ZoomIn.springify().damping(11)} style={styles.resultWrap}>
                  <View style={styles.resultPoster}>
                    {rouletteResult.poster_path ? (
                      <Image source={{ uri: IMG(rouletteResult.poster_path, 'w342')! }} style={styles.resultPosterImg} />
                    ) : (
                      <Ionicons name="film-outline" size={40} color={theme.textFaint} />
                    )}
                  </View>
                </Animated.View>
                <Animated.View entering={FadeInDown.delay(200).duration(300)}>
                  <Text style={styles.resultTitle}>{displayTitle(rouletteResult)}</Text>
                  {rouletteResult.year ? <Text style={[styles.rouletteHint, { textAlign: 'center' }]}>{rouletteResult.year}</Text> : null}
                </Animated.View>
                <View style={styles.rouletteBtns}>
                  <TouchableOpacity style={styles.rouletteGhost} onPress={() => { setRouletteResult(null); setCountdown(10); }}>
                    <Ionicons name="refresh" size={16} color={theme.text} />
                    <Text style={styles.rouletteGhostText}>{t.randomAgain}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.roulettePrimary} onPress={closeRoulette}>
                    <Text style={styles.roulettePrimaryText}>{t.close}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={filterOpen} transparent animationType="fade" onRequestClose={() => setFilterOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setFilterOpen(false)} />
          <View style={styles.filterSheet}>
            <View style={styles.filterHeaderRow}>
              <Text style={styles.filterHeader}>{t.filters}</Text>
              <TouchableOpacity onPress={() => { setFGenres(NO_GENRES); setFLength('all'); setFKids(false); setFHype(false); }}>
                <Text style={styles.clearText}>{t.clear}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.filterLabel}>{t.lengthLabel}</Text>
            <View style={styles.wrapRow}>
              {LENGTH_OPTIONS.map((l) => (
                <TouchableOpacity key={l.key} style={[styles.fChip, fLength === l.key && styles.fChipOn]} onPress={() => setFLength(l.key)}>
                  <Text style={[styles.fChipText, fLength === l.key && styles.fChipTextOn]}>{l.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.kidsRow}>
              <Text style={styles.filterLabel}>{t.hypeFilter}</Text>
              <Switch value={fHype} onValueChange={setFHype} trackColor={{ true: theme.flame, false: theme.surface2 }} thumbColor="#fff" />
            </View>

            <View style={styles.kidsRow}>
              <Text style={styles.filterLabel}>{t.kids}</Text>
              <Switch value={fKids} onValueChange={setFKids} trackColor={{ true: theme.red, false: theme.surface2 }} thumbColor="#fff" />
            </View>

            <Text style={styles.filterLabel}>{t.genreLabel}</Text>
            <GenreDropdown value={fGenres} onChange={setFGenres} />

            <TouchableOpacity style={styles.applyBtn} onPress={() => setFilterOpen(false)}>
              <Text style={styles.applyText}>{t.apply}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!gridActionFor} transparent animationType="fade" onRequestClose={() => setGridActionFor(null)}>
        <Pressable style={styles.backdrop} onPress={() => setGridActionFor(null)}>
          <View style={styles.menu}>
            <Text style={styles.gridMenuTitle} numberOfLines={2}>{gridActionFor ? displayTitle(gridActionFor) : ''}</Text>
            {gridActionFor && !gridActionFor.seen ? (
              <TouchableOpacity style={styles.menuItem} onPress={() => { const m = gridActionFor!; setGridActionFor(null); onMarkSeen(m); }}>
                <Ionicons name="checkmark-done" size={18} color={theme.green} />
                <Text style={styles.menuItemText}>{t.actionSeen}</Text>
              </TouchableOpacity>
            ) : null}
            {gridActionFor && !gridActionFor.seen ? (
              <TouchableOpacity style={styles.menuItem} onPress={() => { const m = gridActionFor!; setGridActionFor(null); onHype(m); }}>
                <Ionicons name={hypeOf(gridActionFor, session?.memberName).mine ? 'flame' : 'flame-outline'} size={18} color={theme.flame} />
                <Text style={styles.menuItemText}>{hypeOf(gridActionFor, session?.memberName).mine ? t.hypeOff : t.hypeOn}</Text>
              </TouchableOpacity>
            ) : null}
            {gridActionFor?.seen ? (
              <>
                <TouchableOpacity style={styles.menuItem} onPress={() => { const m = gridActionFor!; setGridActionFor(null); onMarkSeen(m); }}>
                  <Ionicons name="star-outline" size={18} color={theme.gold} />
                  <Text style={styles.menuItemText}>
                    {session?.memberName && (gridActionFor.ratings ?? {})[session.memberName] ? t.editRating : t.giveRating}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={() => { const m = gridActionFor!; setGridActionFor(null); onUnsee(m); }}>
                  <Ionicons name="arrow-undo" size={18} color={theme.text} />
                  <Text style={styles.menuItemText}>{t.backToList}</Text>
                </TouchableOpacity>
              </>
            ) : null}
            <TouchableOpacity style={styles.menuItem} onPress={() => { const m = gridActionFor!; setGridActionFor(null); onDelete(m); }}>
              <Ionicons name="trash-outline" size={18} color={theme.red} />
              <Text style={[styles.menuItemText, { color: theme.red }]}>{t.actionDelete}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.gridMenuCancel} onPress={() => setGridActionFor(null)}>
              <Text style={styles.gridMenuCancelText}>{t.cancel}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <TasteMatchModal
        match={taste} me={session?.memberName ?? ''} visible={tasteOpen}
        onClose={() => setTasteOpen(false)} titleOf={displayTitle}
      />
      <MovieDetails target={detailFor} lang={titleLang} onClose={() => setDetailFor(null)} />
    </Background>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 16, paddingTop: 8, paddingBottom: 100 },
  fab: {
    position: 'absolute', right: 20, bottom: 24, width: 58, height: 58, borderRadius: 29,
    backgroundColor: theme.red, alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
  newsBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 6,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md,
    backgroundColor: theme.redSoft, borderWidth: 1, borderColor: theme.redDark,
  },
  newsText: { flex: 1, color: theme.text, fontSize: 13 },
  toast: {
    position: 'absolute', top: 72, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(20,13,11,0.96)', borderWidth: 1, borderColor: theme.border,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22, maxWidth: '86%', elevation: 6,
  },
  toastText: { color: theme.text, fontSize: 13 },
  tabsBar: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
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
  rouletteCount: { color: theme.red, fontSize: 56, fontFamily: 'BebasNeue_400Regular', marginVertical: 2 },
  spinFrame: {
    width: 130, height: 192, borderRadius: 12, marginTop: 14, overflow: 'hidden',
    borderWidth: 2, borderColor: theme.redSoft, backgroundColor: theme.surface2,
  },
  spinPoster: { width: 126, height: 188, borderRadius: 10 },
  spinPosterEmpty: { alignItems: 'center', justifyContent: 'center' },
  resultWrap: { marginTop: 14 },
  rouletteHint: { color: theme.textMuted, fontSize: 14, textAlign: 'center', marginTop: 2 },
  rouletteBtns: { flexDirection: 'row', gap: 10, marginTop: 20, alignSelf: 'stretch' },
  rouletteGhost: { flex: 1, flexDirection: 'row', gap: 6, height: 48, borderRadius: radius.md, backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
  rouletteGhostText: { color: theme.text, fontSize: 15, fontWeight: '500' },
  roulettePrimary: { flex: 1, flexDirection: 'row', gap: 6, height: 48, borderRadius: radius.md, backgroundColor: theme.red, alignItems: 'center', justifyContent: 'center' },
  roulettePrimaryText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  resultPoster: { width: 150, height: 222, borderRadius: 12, backgroundColor: theme.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 2, borderColor: theme.red },
  resultPosterImg: { width: 150, height: 222 },
  resultTitle: { color: theme.text, fontSize: 19, fontWeight: '700', textAlign: 'center', marginTop: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: theme.border },
  sectionTitle: { color: theme.text, fontSize: 19, fontWeight: '600' },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, marginBottom: 12, backgroundColor: theme.surface2, borderRadius: radius.md, paddingHorizontal: 14, height: 42, borderWidth: 1, borderColor: theme.border },
  sortBtnText: { flex: 1, color: theme.text, fontSize: 14, fontWeight: '500' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.surface, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: theme.border },
  cardActive: { borderColor: theme.red, backgroundColor: theme.surface2 },
  rank: { width: 24, height: 24, borderRadius: 8, backgroundColor: theme.redSoft, alignItems: 'center', justifyContent: 'center' },
  rankText: { color: theme.red, fontWeight: '700', fontSize: 12 },
  poster: { width: 42, height: 60, borderRadius: 6, backgroundColor: theme.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  posterImg: { width: 42, height: 60 },
  title: { color: theme.text, fontSize: 15, fontWeight: '600' },
  subRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 3 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  hypeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  hypeBtnMatch: { backgroundColor: theme.flameSoft, borderWidth: 1, borderColor: theme.flame },
  ratingText: { color: theme.gold, fontSize: 12, fontWeight: '600' },
  meta: { color: theme.textMuted, fontSize: 12 },
  logos: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  byChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 4,
    backgroundColor: theme.surface2, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3,
    borderWidth: 1, borderColor: theme.border,
  },
  byChipText: { color: theme.textFaint, fontSize: 10 },
  logo: { width: 22, height: 22, borderRadius: 5, backgroundColor: '#fff' },
  ourRatings: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  ourRating: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: theme.surface2, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  ourRatingText: { color: theme.text, fontSize: 11 },
  rateChip: { borderWidth: 1, borderColor: theme.gold, backgroundColor: 'rgba(245,179,1,0.08)' },
  rateChipText: { color: theme.gold, fontSize: 11, fontWeight: '600' },
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
  gridMenuTitle: { color: theme.text, fontSize: 15, fontWeight: '600', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 },
  gridMenuCancel: { alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: theme.border, marginTop: 4 },
  gridMenuCancelText: { color: theme.textMuted, fontSize: 14 },
  rateTitle: { color: theme.text, fontSize: 16, fontWeight: '600', textAlign: 'center', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 14, lineHeight: 22 },
  scoreGrid: { paddingHorizontal: 8 },
  scoreRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 10 },
  scoreBtn: { width: 50, height: 48, borderRadius: 10, backgroundColor: theme.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.border },
  scoreText: { color: theme.text, fontSize: 18, fontWeight: '600' },
  skipBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 8 },
  skipText: { color: theme.textMuted, fontSize: 14 },
});
