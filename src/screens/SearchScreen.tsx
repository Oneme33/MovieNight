import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image, ActivityIndicator, Keyboard, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { hTap } from '../haptics';
import { theme, radius } from '../theme';
import { Background } from '../Background';
import { t } from '../i18n';
import { useSession } from '../ListContext';
import { searchMovies, discover, loadExtrasBatched, LOGO, OUR_PROVIDERS, SearchResult, DiscoverSort } from '../tmdb';
import { addMovie, fetchMovies } from '../db';
import { MovieDetails, DetailTarget } from '../MovieDetails';
import { SkeletonList } from '../Loader';
import { OptionMenu } from '../watchlist/Menus';
import { SORTS, DEFAULT_FILTERS, SearchFilters, filterCount, visibleResults } from '../search/logic';
import { ResultCard } from '../search/ResultCard';
import { SearchFilterSheet } from '../search/SearchFilterSheet';

export default function SearchScreen() {
  const { session, titleLang, services } = useSession();
  const myProviders = OUR_PROVIDERS.filter((p) => services.includes(p.key));
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [service, setService] = useState<number | null>(null);
  const [streamingOnly, setStreamingOnly] = useState(false);
  const [detailFor, setDetailFor] = useState<DetailTarget>(null);
  const [sort, setSort] = useState<DiscoverSort>('popular');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [listedIds, setListedIds] = useState<Set<number>>(new Set());
  const [seenIds, setSeenIds] = useState<Set<number>>(new Set());
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { genres, length, kids, yearFrom, yearTo } = filters;

  // Refresh on focus, so movies marked as seen elsewhere are hidden here too.
  useFocusEffect(useCallback(() => {
    if (!session) return;
    fetchMovies(session.listId).then((ms) => {
      setAdded(new Set(ms.map((m) => m.tmdb_id).filter(Boolean) as number[]));
      setSeenIds(new Set(ms.filter((m) => m.seen && m.tmdb_id).map((m) => m.tmdb_id as number)));
      // Snapshot on focus: a movie you add right now stays visible (with its checkmark).
      setListedIds(new Set(ms.filter((m) => !m.seen && m.tmdb_id).map((m) => m.tmdb_id as number)));
    }).catch(() => {});
  }, [session]));

  // If the selected service was removed in Settings, fall back to "All".
  useEffect(() => {
    if (service && !myProviders.some((p) => p.id === service)) setService(null);
  }, [services]);

  const fetchExtrasFor = (list: SearchResult[]) => {
    loadExtrasBatched(list.map((r) => r.tmdb_id), titleLang, (batch) => {
      setResults((prev) => prev.map((x) => {
        const ex = batch[x.tmdb_id];
        return ex
          ? { ...x, ours: ex.ours, hasFlatrate: ex.hasFlatrate, rating: ex.rating ?? x.rating, runtime: ex.runtime, providersLoaded: true, extrasLoaded: true }
          : x;
      }));
    }, (id) => setResults((prev) => prev.map((x) => (x.tmdb_id === id ? { ...x, extrasLoaded: true } : x))));
  };
  const browseGen = useRef(0);
  const discoverPage = (p: number) => discover({
    providerId: service, streaming: streamingOnly, streamingIds: myProviders.map((x) => x.id),
    sort, lang: titleLang, page: p, genres, length, kids, yearFrom, yearTo,
  });

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const res = await searchMovies(q, titleLang);
      setResults(res);
      setLoading(false);
      fetchExtrasFor(res);
    } catch { setLoading(false); }
  }, [titleLang]);

  // Browse (discover) whenever there is no query — reacts to service/sort/filters/language.
  useEffect(() => {
    if (query.trim()) return;
    let cancelled = false;
    browseGen.current++;
    setLoading(true);
    setPage(1);
    discoverPage(1)
      .then((d) => {
        if (cancelled) return;
        setResults(d.results);
        setTotalPages(d.totalPages);
        fetchExtrasFor(d.results);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [service, streamingOnly, sort, titleLang, genres, length, kids, yearFrom, yearTo, query, services.join(',')]);

  const loadMore = async () => {
    if (query.trim() || loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    const gen = browseGen.current;
    try {
      const next = page + 1;
      const d = await discoverPage(next);
      if (gen !== browseGen.current) return;
      setResults((prev) => {
        const have = new Set(prev.map((r) => r.tmdb_id));
        const fresh = d.results.filter((r) => !have.has(r.tmdb_id));
        fetchExtrasFor(fresh);
        return [...prev, ...fresh];
      });
      setPage(next);
      setTotalPages(d.totalPages);
    } catch {} finally { setLoadingMore(false); }
  };

  const onChange = (txt: string) => {
    setQuery(txt);
    if (debounce.current) clearTimeout(debounce.current);
    if (txt.trim()) debounce.current = setTimeout(() => runSearch(txt), 450);
  };

  const onAdd = async (r: SearchResult) => {
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

  const browsing = !query.trim();
  const visible = visibleResults(results, { searching: !browsing, f: filters, seenIds, listedIds, service, streamingOnly, services, sort });
  const nFilters = filterCount(filters);

  // With a length filter a page can thin out a lot; top it up automatically (a few pages max).
  const extrasPending = browsing && length !== 'all' && results.some((r) => !r.extrasLoaded);
  useEffect(() => {
    if (!browsing || length === 'all' || loading || loadingMore || extrasPending) return;
    if (visible.length >= 10 || page >= Math.min(totalPages, 4)) return;
    loadMore();
  }, [browsing, length, loading, loadingMore, extrasPending, visible.length, page, totalPages]);

  const footer = (browsing && page < totalPages && !loading) ? (
    <TouchableOpacity style={s.moreBtn} onPress={loadMore} disabled={loadingMore}>
      {loadingMore ? <ActivityIndicator color={theme.text} /> : <Text style={s.moreText}>{t.loadMore}</Text>}
    </TouchableOpacity>
  ) : null;
  const chip = (on: boolean, onPress: () => void, children: React.ReactNode, key?: string) => (
    <TouchableOpacity key={key} style={[s.svcChip, on && s.svcChipOn]} onPress={onPress}>{children}</TouchableOpacity>
  );
  const allOn = service === null && !streamingOnly;
  const streamOn = service === null && streamingOnly;

  return (
    <Background>
     <View style={s.container}>
      <View style={s.searchBar}>
        <Ionicons name="search" size={18} color={theme.textFaint} />
        <TextInput
          style={s.input} placeholder={t.searchPlaceholder} placeholderTextColor={theme.textFaint}
          value={query} onChangeText={onChange} returnKeyType="search"
          onSubmitEditing={() => { Keyboard.dismiss(); runSearch(query); }} autoCorrect={false}
        />
        {query ? <TouchableOpacity onPress={() => setQuery('')}><Ionicons name="close-circle" size={18} color={theme.textFaint} /></TouchableOpacity> : null}
      </View>

      <View style={s.chipWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
          {chip(allOn, () => { setService(null); setStreamingOnly(false); },
            <Text style={[s.svcText, allOn && s.svcTextOn]}>{t.all}</Text>)}
          {chip(streamOn, () => { setService(null); setStreamingOnly(true); }, <>
            <Ionicons name="tv-outline" size={15} color={streamOn ? theme.text : theme.textMuted} />
            <Text style={[s.svcText, streamOn && s.svcTextOn]}>{t.streaming}</Text>
          </>)}
          {myProviders.map((p) => {
            const on = service === p.id;
            const l = LOGO(p.logo);
            return chip(on, () => setService(on ? null : p.id), <>
              {l ? <Image source={{ uri: l }} style={s.svcLogo} /> : null}
              <Text style={[s.svcText, on && s.svcTextOn]}>{p.key}</Text>
            </>, p.key);
          })}
        </ScrollView>
      </View>

      <View style={s.controls}>
        <TouchableOpacity style={s.ctrlBtn} onPress={() => setSortMenuOpen(true)} activeOpacity={0.8}>
          <Ionicons name="swap-vertical" size={15} color={theme.text} />
          <Text style={s.ctrlText} numberOfLines={1}>{SORTS.find((o) => o.key === sort)!.label}</Text>
          <Ionicons name="chevron-down" size={14} color={theme.textMuted} style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>
        {browsing ? (
          <TouchableOpacity style={[s.ctrlBtn, nFilters > 0 && s.ctrlBtnOn]} onPress={() => setFilterOpen(true)} activeOpacity={0.8}>
            <Ionicons name="options-outline" size={15} color={nFilters > 0 ? '#fff' : theme.text} />
            <Text style={[s.ctrlText, nFilters > 0 && { color: '#fff' }]}>{t.filters}{nFilters ? ` (${nFilters})` : ''}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={{ marginHorizontal: -16, marginTop: -8 }}><SkeletonList count={7} noHeader /></View>
      ) : (
        <Animated.FlatList
          style={{ flex: 1 }}
          data={visible}
          keyExtractor={(r: SearchResult) => String(r.tmdb_id)}
          renderItem={({ item }: { item: SearchResult }) => (
            <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOut.duration(160)}>
              <ResultCard item={item} isAdded={added.has(item.tmdb_id)} onOpen={setDetailFor} onAdd={onAdd} />
            </Animated.View>
          )}
          itemLayoutAnimation={LinearTransition.duration(180)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: 24 }}
          ListFooterComponent={footer}
          ListEmptyComponent={extrasPending || loadingMore
            ? <View style={{ marginHorizontal: -16, marginTop: -8 }}><SkeletonList count={5} noHeader /></View>
            : <Text style={s.faintCenter}>{t.noResults}</Text>}
        />
      )}
     </View>

     <OptionMenu visible={sortMenuOpen} options={SORTS} value={sort} onPick={setSort} onClose={() => setSortMenuOpen(false)} />
     <SearchFilterSheet visible={filterOpen} value={filters} onChange={setFilters} onClose={() => setFilterOpen(false)} />
     <MovieDetails target={detailFor} lang={titleLang} onClose={() => setDetailFor(null)} />
    </Background>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent', paddingHorizontal: 16 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.surface,
    borderRadius: radius.md, paddingHorizontal: 14, height: 46, marginTop: 14,
  },
  input: { flex: 1, color: theme.text, fontSize: 15 },
  chipWrap: { height: 54, justifyContent: 'center' },
  chipRow: { gap: 8, paddingRight: 8, alignItems: 'center' },
  svcChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 38,
    borderRadius: 20, backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border,
  },
  svcChipOn: { borderColor: theme.red, backgroundColor: theme.redSoft },
  svcLogo: { width: 22, height: 22, borderRadius: 5, backgroundColor: '#fff' },
  svcText: { color: theme.textMuted, fontSize: 13 },
  svcTextOn: { color: theme.text, fontWeight: '600' },
  controls: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  ctrlBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.surface2,
    borderRadius: radius.md, paddingHorizontal: 12, height: 40, borderWidth: 1, borderColor: theme.border,
  },
  ctrlBtnOn: { backgroundColor: theme.red, borderColor: theme.red },
  ctrlText: { flex: 1, color: theme.text, fontSize: 13, fontWeight: '500' },
  faintCenter: { color: theme.textFaint, fontSize: 14, textAlign: 'center', marginTop: 40 },
  moreBtn: { marginTop: 4, marginBottom: 20, alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 12, borderRadius: radius.md, backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border },
  moreText: { color: theme.text, fontSize: 14, fontWeight: '500' },
});
