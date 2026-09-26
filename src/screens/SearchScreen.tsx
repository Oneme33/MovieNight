import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet,
  Image, ActivityIndicator, Keyboard, ScrollView, Modal, Pressable, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { hTap } from '../haptics';
import { theme, radius } from '../theme';
import { Background } from '../Background';
import { t } from '../i18n';
import { useSession } from '../ListContext';
import {
  searchMovies, discover, loadExtrasBatched, IMG, LOGO,
  OUR_PROVIDERS, SearchResult, DiscoverSort, Length, LENGTH_OPTIONS, matchesLength,
} from '../tmdb';
import { GenreDropdown } from '../GenreDropdown';
import { addMovie, fetchMovies } from '../db';
import { MovieDetails, DetailTarget } from '../MovieDetails';
import { SkeletonList } from '../Loader';

const SORTS: { key: DiscoverSort; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'popular', label: t.sortPopular, icon: 'flame' },
  { key: 'rating', label: t.sortRating, icon: 'star' },
  { key: 'year_desc', label: t.jaarDown, icon: 'arrow-down' },
  { key: 'year_asc', label: t.jaarUp, icon: 'arrow-up' },
  { key: 'length', label: t.sortLength, icon: 'hourglass-outline' },
];

const THIS_YEAR = new Date().getFullYear();
const YEAR_PRESETS: { label: string; from: number | null; to: number | null }[] = [
  { label: t.yearRecent, from: THIS_YEAR - 2, to: null },
  { label: '2010–19', from: 2010, to: 2019 },
  { label: '2000–09', from: 2000, to: 2009 },
  { label: '1990–99', from: 1990, to: 1999 },
  { label: '1980–89', from: 1980, to: 1989 },
  { label: t.yearOld, from: null, to: 1979 },
];
const parseYear = (v: string) => {
  const n = Number(v);
  return /^\d{4}$/.test(v) && n >= 1900 && n <= THIS_YEAR ? n : null;
};

const provKey = (id: number | null) => (id ? OUR_PROVIDERS.find((p) => p.id === id)?.key : undefined);

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
  const [genre, setGenre] = useState<number | null>(null);
  const [length, setLength] = useState<Length>('all');
  const [kids, setKids] = useState(false);
  const [hideSeen, setHideSeen] = useState(true);
  const [hideListed, setHideListed] = useState(true);
  const [listedIds, setListedIds] = useState<Set<number>>(new Set());
  const [seenIds, setSeenIds] = useState<Set<number>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const [yearFrom, setYearFrom] = useState<number | null>(null);
  const [yearTo, setYearTo] = useState<number | null>(null);
  const [fromDraft, setFromDraft] = useState('');
  const [toDraft, setToDraft] = useState('');
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          ? { ...x, ours: ex.ours, hasFlatrate: ex.hasFlatrate, rating: x.rating ?? ex.rating, runtime: ex.runtime, providersLoaded: true, extrasLoaded: true }
          : x;
      }));
    }, (id) => setResults((prev) => prev.map((x) => (x.tmdb_id === id ? { ...x, extrasLoaded: true } : x))));
  };
  const browseGen = useRef(0);

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
    discover({ providerId: service, streaming: streamingOnly, streamingIds: myProviders.map((p) => p.id), sort, lang: titleLang, page: 1, genre, length, kids, yearFrom, yearTo })
      .then((d) => {
        if (cancelled) return;
        setResults(d.results);
        setTotalPages(d.totalPages);
        fetchExtrasFor(d.results);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [service, streamingOnly, sort, titleLang, genre, length, kids, yearFrom, yearTo, query, services.join(',')]);

  // Years are typed as drafts and applied when the field or the filter sheet is left.
  const commitYears = (fromS = fromDraft, toS = toDraft) => {
    let a = parseYear(fromS);
    let b = parseYear(toS);
    if (a && b && a > b) [a, b] = [b, a];
    setYearFrom(a); setYearTo(b);
    setFromDraft(a ? String(a) : ''); setToDraft(b ? String(b) : '');
  };
  const closeFilters = () => { commitYears(); setFilterOpen(false); };

  const loadMore = async () => {
    if (query.trim() || loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    const gen = browseGen.current;
    try {
      const next = page + 1;
      const d = await discover({ providerId: service, streaming: streamingOnly, streamingIds: myProviders.map((p) => p.id), sort, lang: titleLang, page: next, genre, length, kids, yearFrom, yearTo });
      if (gen !== browseGen.current) return;
      setResults((prev) => {
        const seenIds = new Set(prev.map((r) => r.tmdb_id));
        const fresh = d.results.filter((r) => !seenIds.has(r.tmdb_id));
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

  // In search mode: the selected chip acts as a filter + client-side sorting.
  let visible = results;
  // Safety net: TMDB's server-side runtime filter is unreliable, so once the real
  // runtime is loaded we drop movies that don't match the length filter.
  if (!query.trim() && length !== 'all') {
    // Hidden until the real runtime is known, so wrong matches don't flash in and out.
    visible = visible.filter((r) => r.runtime != null && matchesLength(r.runtime, length));
  }
  if (!query.trim() && hideSeen && seenIds.size) visible = visible.filter((r) => !seenIds.has(r.tmdb_id));
  if (!query.trim() && hideListed && listedIds.size) visible = visible.filter((r) => !listedIds.has(r.tmdb_id));
  if (query.trim()) {
    const key = provKey(service);
    if (key) visible = visible.filter((r) => !r.providersLoaded || r.ours.some((o) => o.key === key));
    else if (streamingOnly) visible = visible.filter((r) => !r.providersLoaded || r.ours.some((o) => services.includes(o.key)));
    if (sort !== 'popular') {
      visible = [...visible].sort((a, b) =>
        sort === 'rating' ? (b.rating ?? -1) - (a.rating ?? -1)
          : sort === 'year_desc' ? (b.year ?? 0) - (a.year ?? 0)
            : sort === 'length' ? (a.runtime ?? 9999) - (b.runtime ?? 9999)
              : (a.year ?? 0) - (b.year ?? 0));
    }
  } else if (sort === 'length') {
    // Runtime isn't sortable server-side; sort the loaded page client-side.
    visible = [...visible].sort((a, b) => (a.runtime ?? 9999) - (b.runtime ?? 9999));
  }

  const filterCount = (genre ? 1 : 0) + (length !== 'all' ? 1 : 0) + (kids ? 1 : 0) + (yearFrom || yearTo ? 1 : 0);

  // With a length filter a page can thin out a lot; top it up automatically (a few pages max).
  const browsing = !query.trim();
  const extrasPending = browsing && length !== 'all' && results.some((r) => !r.extrasLoaded);
  useEffect(() => {
    if (!browsing || length === 'all' || loading || loadingMore || extrasPending) return;
    if (visible.length >= 10 || page >= Math.min(totalPages, 4)) return;
    loadMore();
  }, [browsing, length, loading, loadingMore, extrasPending, visible.length, page, totalPages]);

  const renderItem = ({ item }: { item: SearchResult }) => {
    const poster = IMG(item.poster_path, 'w200');
    const isAdded = added.has(item.tmdb_id);
    return (
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
              }) : <Text style={styles.faint}>{item.hasFlatrate ? t.notOnServices : t.notStreamable}</Text>}
          </View>
        </View>
        <TouchableOpacity style={[styles.addBtn, isAdded && styles.addBtnDone]} onPress={() => onAdd(item)} disabled={isAdded}>
          <Ionicons name={isAdded ? 'checkmark' : 'add'} size={20} color={isAdded ? theme.green : theme.red} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const footer = (!query.trim() && page < totalPages && !loading) ? (
    <TouchableOpacity style={styles.moreBtn} onPress={loadMore} disabled={loadingMore}>
      {loadingMore ? <ActivityIndicator color={theme.text} /> : <Text style={styles.moreText}>{t.loadMore}</Text>}
    </TouchableOpacity>
  ) : null;

  return (
    <Background>
     <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={theme.textFaint} />
        <TextInput
          style={styles.input} placeholder={t.searchPlaceholder} placeholderTextColor={theme.textFaint}
          value={query} onChangeText={onChange} returnKeyType="search"
          onSubmitEditing={() => { Keyboard.dismiss(); runSearch(query); }} autoCorrect={false}
        />
        {query ? <TouchableOpacity onPress={() => setQuery('')}><Ionicons name="close-circle" size={18} color={theme.textFaint} /></TouchableOpacity> : null}
      </View>

      <View style={styles.chipWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <TouchableOpacity
            style={[styles.svcChip, service === null && !streamingOnly && styles.svcChipOn]}
            onPress={() => { setService(null); setStreamingOnly(false); }}
          >
            <Text style={[styles.svcText, service === null && !streamingOnly && styles.svcTextOn]}>{t.all}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.svcChip, service === null && streamingOnly && styles.svcChipOn]}
            onPress={() => { setService(null); setStreamingOnly(true); }}
          >
            <Ionicons name="tv-outline" size={15} color={service === null && streamingOnly ? theme.text : theme.textMuted} />
            <Text style={[styles.svcText, service === null && streamingOnly && styles.svcTextOn]}>{t.streaming}</Text>
          </TouchableOpacity>
          {myProviders.map((p) => {
            const on = service === p.id;
            const l = LOGO(p.logo);
            return (
              <TouchableOpacity key={p.key} style={[styles.svcChip, on && styles.svcChipOn]} onPress={() => setService(on ? null : p.id)}>
                {l ? <Image source={{ uri: l }} style={styles.svcLogo} /> : null}
                <Text style={[styles.svcText, on && styles.svcTextOn]}>{p.key}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity style={styles.ctrlBtn} onPress={() => setSortMenuOpen(true)} activeOpacity={0.8}>
          <Ionicons name="swap-vertical" size={15} color={theme.text} />
          <Text style={styles.ctrlText} numberOfLines={1}>{SORTS.find((s) => s.key === sort)!.label}</Text>
          <Ionicons name="chevron-down" size={14} color={theme.textMuted} style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>
        {!query.trim() ? (
          <TouchableOpacity style={[styles.ctrlBtn, filterCount > 0 && styles.ctrlBtnOn]} onPress={() => setFilterOpen(true)} activeOpacity={0.8}>
            <Ionicons name="options-outline" size={15} color={filterCount > 0 ? '#fff' : theme.text} />
            <Text style={[styles.ctrlText, filterCount > 0 && { color: '#fff' }]}>{t.filters}{filterCount ? ` (${filterCount})` : ''}</Text>
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
              {renderItem({ item })}
            </Animated.View>
          )}
          itemLayoutAnimation={LinearTransition.duration(180)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: 24 }}
          ListFooterComponent={footer}
          ListEmptyComponent={extrasPending || loadingMore
            ? <View style={{ marginHorizontal: -16, marginTop: -8 }}><SkeletonList count={5} noHeader /></View>
            : <Text style={styles.faintCenter}>{t.noResults}</Text>}
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

     <Modal visible={filterOpen} transparent animationType="fade" onRequestClose={closeFilters}>
       <View style={styles.backdrop}>
         {/* Tap-outside layer sits behind the sheet, so it never competes with scrolling. */}
         <Pressable style={StyleSheet.absoluteFill} onPress={closeFilters} />
         <View style={styles.filterSheet}>
           <View style={styles.filterHeaderRow}>
             <Text style={styles.filterHeader}>{t.filters}</Text>
             <TouchableOpacity onPress={() => { setGenre(null); setLength('all'); setKids(false); setHideSeen(true); setHideListed(true); commitYears('', ''); }}>
               <Text style={styles.clearText}>{t.clear}</Text>
             </TouchableOpacity>
           </View>
          <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>


           <Text style={styles.filterLabel}>{t.lengthLabel}</Text>
           <View style={styles.wrapRow}>
             {LENGTH_OPTIONS.map((l) => (
               <TouchableOpacity key={l.key} style={[styles.fChip, length === l.key && styles.fChipOn]} onPress={() => setLength(l.key)}>
                 <Text style={[styles.fChipText, length === l.key && styles.fChipTextOn]}>{l.label}</Text>
               </TouchableOpacity>
             ))}
           </View>

           <Text style={styles.filterLabel}>{t.yearLabel}</Text>
           <View style={styles.yearRow}>
             <TextInput
               style={styles.yearInput} value={fromDraft} onChangeText={setFromDraft}
               onEndEditing={() => commitYears()} keyboardType="number-pad" maxLength={4}
               placeholder={t.yearFrom} placeholderTextColor={theme.textFaint}
             />
             <Text style={styles.yearDash}>–</Text>
             <TextInput
               style={styles.yearInput} value={toDraft} onChangeText={setToDraft}
               onEndEditing={() => commitYears()} keyboardType="number-pad" maxLength={4}
               placeholder={t.yearTo} placeholderTextColor={theme.textFaint}
             />
           </View>
           <View style={[styles.wrapRow, { marginTop: 8 }]}>
             {YEAR_PRESETS.map((p) => {
               const on = fromDraft === (p.from ? String(p.from) : '') && toDraft === (p.to ? String(p.to) : '');
               return (
                 <TouchableOpacity
                   key={p.label} style={[styles.fChip, on && styles.fChipOn]}
                   onPress={() => (on ? commitYears('', '') : commitYears(p.from ? String(p.from) : '', p.to ? String(p.to) : ''))}
                 >
                   <Text style={[styles.fChipText, on && styles.fChipTextOn]}>{p.label}</Text>
                 </TouchableOpacity>
               );
             })}
           </View>

           <View style={styles.kidsRow}>
             <Text style={styles.filterLabel}>{t.kids}</Text>
             <Switch value={kids} onValueChange={setKids} trackColor={{ true: theme.red, false: theme.surface2 }} thumbColor="#fff" />
           </View>

           <Text style={styles.filterLabel}>{t.genreLabel}</Text>
           <GenreDropdown value={genre} onChange={setGenre} />

           <View style={styles.kidsRow}>
             <Text style={styles.filterLabel}>{t.hideSeen}</Text>
             <Switch value={hideSeen} onValueChange={setHideSeen} trackColor={{ true: theme.red, false: theme.surface2 }} thumbColor="#fff" />
           </View>
           <View style={styles.kidsRow}>
             <Text style={styles.filterLabel}>{t.hideListed}</Text>
             <Switch value={hideListed} onValueChange={setHideListed} trackColor={{ true: theme.red, false: theme.surface2 }} thumbColor="#fff" />
           </View>
          </ScrollView>
           <TouchableOpacity style={styles.applyBtn} onPress={closeFilters}>
             <Text style={styles.applyText}>{t.apply}</Text>
           </TouchableOpacity>
         </View>
       </View>
     </Modal>

     <MovieDetails target={detailFor} lang={titleLang} onClose={() => setDetailFor(null)} />
    </Background>
  );
}

const styles = StyleSheet.create({
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.surface,
    borderRadius: radius.md, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: theme.border,
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
  faintCenter: { color: theme.textFaint, fontSize: 14, textAlign: 'center', marginTop: 40 },
  addBtn: {
    width: 38, height: 38, borderRadius: radius.md, borderWidth: 1.5, borderColor: theme.red,
    backgroundColor: 'rgba(225,29,42,0.10)', alignItems: 'center', justifyContent: 'center',
  },
  addBtnDone: { borderColor: theme.green, backgroundColor: 'rgba(63,178,127,0.10)' },
  moreBtn: { marginTop: 4, marginBottom: 20, alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 12, borderRadius: radius.md, backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border },
  moreText: { color: theme.text, fontSize: 14, fontWeight: '500' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 28 },
  menu: { backgroundColor: theme.surfaceOpaque, borderRadius: 16, padding: 8, borderWidth: 1, borderColor: theme.border },
  menuTitle: { color: theme.textMuted, fontSize: 12, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 14, borderRadius: 10 },
  menuItemText: { color: theme.text, fontSize: 15 },
  filterSheet: { maxHeight: '88%', backgroundColor: theme.surfaceOpaque, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.border },
  filterHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  filterHeader: { color: theme.text, fontSize: 17, fontWeight: '600' },
  clearText: { color: theme.red, fontSize: 14 },
  filterLabel: { color: theme.textMuted, fontSize: 13, marginBottom: 8, marginTop: 10 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border },
  fChipOn: { backgroundColor: theme.red, borderColor: theme.red },
  fChipText: { color: theme.textMuted, fontSize: 13 },
  fChipTextOn: { color: '#fff', fontWeight: '600' },
  yearRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  yearInput: {
    flex: 1, height: 42, borderRadius: radius.md, backgroundColor: theme.surface2, borderWidth: 1,
    borderColor: theme.border, color: theme.text, fontSize: 15, textAlign: 'center',
  },
  yearDash: { color: theme.textMuted, fontSize: 16 },
  kidsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  applyBtn: { marginTop: 18, backgroundColor: theme.red, borderRadius: radius.md, height: 48, alignItems: 'center', justifyContent: 'center' },
  applyText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
