import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hTap, hSuccess, hWarn, hSelect } from '../haptics';
import { t } from '../i18n';
import type { Session, TitleLang } from '../ListContext';
import { supabase, MovieRow } from '../supabase';
import { fetchMovies, deleteMovie, persistOrder, markSeen, unmarkSeen, setHype, hypeOf } from '../db';
import { loadExtrasBatched, MovieExtras } from '../tmdb';

// Everything the watchlist screen needs from the network: the movies (offline cache first,
// then the server, live via realtime), their TMDB/IMDb extras, toasts, and the actions that
// write (optimistically, rolled back with a message when the save fails).
export function useWatchlist(session: Session | null, titleLang: TitleLang, nameOf: (k?: string | null) => string, refreshMembers: () => void) {
  const [movies, setMovies] = useState<MovieRow[]>([]);
  const [extras, setExtras] = useState<Record<number, MovieExtras>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [newsMsg, setNewsMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const newsChecked = useRef(false);
  const moviesRef = useRef(movies);
  moviesRef.current = movies;
  const me = session?.memberId;
  // Who added a movie: the member (by id), or the name stored with older movies.
  const addedBy = useCallback((m: MovieRow) => (m.added_by_member ? nameOf(m.added_by_member) : m.added_by) || '', [nameOf]);
  const isMine = (m: MovieRow) => (m.added_by_member ? m.added_by_member === me : m.added_by === session?.memberName);

  const showToast = useCallback((msg: string) => {
    hTap();
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // In-app notification when the partner adds, rates or hypes a movie while the app is open.
  const onRealtime = useCallback((payload: any) => {
    if (!me) return;
    if (payload.eventType === 'INSERT') {
      const n = payload.new as MovieRow;
      if (n?.title && addedBy(n) && !isMine(n)) showToast(t.partnerAdded(addedBy(n), n.title));
    } else if (payload.eventType === 'UPDATE') {
      const n = payload.new as MovieRow;
      const oldR = ((payload.old?.ratings as Record<string, number>) ?? {});
      for (const [key, score] of Object.entries(n?.ratings ?? {})) {
        if (key !== me && oldR[key] !== score) { showToast(t.partnerRated(nameOf(key), n.title, score)); break; }
      }
      // Our own votes are applied locally first, so this only fires for the partner's.
      const before = moviesRef.current.find((m) => m.id === n?.id);
      if (n && !n.seen && before && !hypeOf(before).both && hypeOf(n).both) {
        hSuccess();
        showToast(t.hypeMatch(n.title));
      }
    }
  }, [me, showToast, nameOf, addedBy]);

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
      refreshMembers(); // a partner may have joined or renamed
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
          const news = ms.filter((m) => addedBy(m) && !isMine(m) && Date.parse(m.created_at) > prevT);
          if (news.length) setNewsMsg(t.catchUp(addedBy(news[0]), news.length));
        }
      }
    } catch {
      // Offline or transient error: keep showing the cached list.
    } finally { setLoading(false); }
  }, [session, refreshMembers, addedBy]);

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
  useEffect(() => { langRef.current = titleLang; setExtras({}); requested.current.clear(); }, [titleLang]);
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

  const patch = (id: string, fields: Partial<MovieRow>) =>
    setMovies((prev) => prev.map((m) => (m.id === id ? { ...m, ...fields } : m)));

  // A write failed (offline, server error): undo the optimistic change, say so, resync.
  const saveFailed = useCallback((undo: () => void) => {
    undo();
    showToast(t.saveFailed);
    load();
  }, [showToast, load]);

  const onDelete = useCallback((m: MovieRow) => {
    hWarn();
    setMovies((prev) => prev.filter((x) => x.id !== m.id));
    deleteMovie(m.id).catch(() => saveFailed(() =>
      setMovies((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))));
  }, [saveFailed]);

  const onUnsee = useCallback((m: MovieRow) => {
    hTap();
    patch(m.id, { seen: false, seen_at: null });
    unmarkSeen(m.id).catch(() => saveFailed(() => patch(m.id, { seen: m.seen, seen_at: m.seen_at })));
  }, [saveFailed]);

  const onHype = useCallback((m: MovieRow) => {
    if (!me) return;
    const on = !hypeOf(m, me).mine;
    const hype = { ...(m.hype ?? {}) };
    if (on) hype[me] = true; else delete hype[me];
    patch(m.id, { hype });
    if (hypeOf({ ...m, hype }, me).both && !hypeOf(m, me).both) { hSuccess(); showToast(t.hypeMatch(m.title)); }
    else hSelect();
    setHype(m.id, on)
      .then((h) => patch(m.id, { hype: h }))
      .catch(() => { patch(m.id, { hype: m.hype ?? {} }); showToast(t.hypeFailed); });
  }, [me, showToast]);

  // Mark as watched with your score (or edit it later); null = watched without a rating.
  const rate = useCallback((m: MovieRow, score: number | null) => {
    if (!me) return;
    if (score != null) hSuccess(); else hTap();
    const ratings = { ...(m.ratings ?? {}) };
    if (score != null) ratings[me] = score; else delete ratings[me];
    patch(m.id, { seen: true, seen_at: m.seen_at ?? new Date().toISOString(), ratings });
    markSeen(m.id, score)
      .then((row) => { if (row?.id) patch(m.id, { seen: row.seen, seen_at: row.seen_at, ratings: row.ratings }); })
      .catch(() => saveFailed(() => patch(m.id, { seen: m.seen, seen_at: m.seen_at, ratings: m.ratings })));
  }, [me, saveFailed]);

  // Manual order after dragging (the unseen list in its new order).
  const reorder = useCallback((data: MovieRow[]) => {
    const before = moviesRef.current;
    persistOrder(data).catch(() => saveFailed(() => setMovies(before)));
    setMovies((prev) => [...data, ...prev.filter((m) => m.seen)]);
  }, [saveFailed]);

  return {
    movies, extras, loading, refreshing, onRefresh, toast, newsMsg, dismissNews: () => setNewsMsg(null),
    displayTitle, addedBy, onDelete, onUnsee, onHype, rate, reorder,
  };
}
