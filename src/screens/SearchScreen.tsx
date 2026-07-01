import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet,
  Image, ActivityIndicator, Keyboard, ScrollView, Modal, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius } from '../theme';
import { Background } from '../Background';
import { t } from '../i18n';
import { useSession } from '../ListContext';
import {
  searchMovies, discoverByProvider, getMovieExtras, IMG, LOGO,
  OUR_PROVIDERS, SearchResult, DiscoverSort,
} from '../tmdb';
import { addMovie, fetchMovies } from '../db';

const SORTS: { key: DiscoverSort; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'popular', label: t.sortPopular, icon: 'flame' },
  { key: 'rating', label: t.sortRating, icon: 'star' },
  { key: 'year_desc', label: t.jaarDown, icon: 'arrow-down' },
  { key: 'year_asc', label: t.jaarUp, icon: 'arrow-up' },
];

export default function SearchScreen() {
  const { session, titleLang } = useSession();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [onlyOurs, setOnlyOurs] = useState(false);
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [service, setService] = useState<(typeof OUR_PROVIDERS)[number] | null>(null);
  const [sort, setSort] = useState<DiscoverSort>('popular');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!session) return;
    fetchMovies(session.listId).then((ms) => {
      setAdded(new Set(ms.map((m) => m.tmdb_id).filter(Boolean) as number[]));
    }).catch(() => {});
  }, [session]);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await searchMovies(q, titleLang);
      setResults(res);
      setLoading(false);
      res.forEach(async (r) => {
        const ex = await getMovieExtras(r.tmdb_id, titleLang);
        setResults((prev) => prev.map((x) =>
          x.tmdb_id === r.tmdb_id ? { ...x, ours: ex.ours, rating: x.rating ?? ex.rating, providersLoaded: true } : x));
      });
    } catch { setLoading(false); }
  }, [titleLang]);

  // Browse by service (discover) — page 1 when service/sort/language changes.
  useEffect(() => {
    if (!service || query.trim()) return;
    let cancelled = false;
    setLoading(true);
    setPage(1);
    discoverByProvider(service.id, sort, titleLang, 1)
      .then((d) => { if (!cancelled) { setResults(d.results); setTotalPages(d.totalPages); } })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [service, sort, titleLang, query]);

  const loadMore = async () => {
    if (!service || loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const d = await discoverByProvider(service.id, sort, titleLang, next);
      setResults((prev) => {
        const seen = new Set(prev.map((r) => r.tmdb_id));
        return [...prev, ...d.results.filter((r) => !seen.has(r.tmdb_id))];
      });
      setPage(next);
      setTotalPages(d.totalPages);
    } catch {} finally { setLoadingMore(false); }
  };

  const onChange = (txt: string) => {
    setQuery(txt);
    if (txt.trim()) setService(null);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => runSearch(txt), 450);
  };

  const selectService = (p: (typeof OUR_PROVIDERS)[number]) => {
    if (service?.key === p.key) { setService(null); setResults([]); return; }
    setQuery(''); setResults([]); setService(p);
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

  let visible = results;
  if (query.trim()) {
    if (onlyOurs) visible = visible.filter((r) => !r.providersLoaded || r.ours.length > 0);
    if (sort !== 'popular') {
      visible = [...visible].sort((a, b) =>
        sort === 'rating' ? (b.rating ?? -1) - (a.rating ?? -1)
          : sort === 'year_desc' ? (b.year ?? 0) - (a.year ?? 0)
            : (a.year ?? 0) - (b.year ?? 0));
    }
  }

  const renderItem = ({ item }: { item: SearchResult }) => {
    const poster = IMG(item.poster_path, 'w200');
    const isAdded = added.has(item.tmdb_id);
    return (
      <View style={styles.card}>
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
      </View>
    );
  };

  const footer = (service && !query.trim() && page < totalPages && !loading) ? (
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
        {query ? <TouchableOpacity onPress={() => { setQuery(''); setResults([]); }}><Ionicons name="close-circle" size={18} color={theme.textFaint} /></TouchableOpacity> : null}
      </View>

      <View style={styles.chipWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {OUR_PROVIDERS.map((p) => {
            const on = service?.key === p.key;
            const l = LOGO(p.logo);
            return (
              <TouchableOpacity key={p.key} style={[styles.svcChip, on && styles.svcChipOn]} onPress={() => selectService(p)}>
                {l ? <Image source={{ uri: l }} style={styles.svcLogo} /> : null}
                <Text style={[styles.svcText, on && styles.svcTextOn]}>{p.key}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.sortRow}>
        <TouchableOpacity style={styles.sortBtn} onPress={() => setSortMenuOpen(true)} activeOpacity={0.8}>
          <Ionicons name="swap-vertical" size={16} color={theme.text} />
          <Text style={styles.sortBtnText}>{t.sortPrefix}{SORTS.find((s) => s.key === sort)!.label}</Text>
          <Ionicons name="chevron-down" size={16} color={theme.textMuted} style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>
        {query ? (
          <TouchableOpacity style={styles.filterMini} onPress={() => setOnlyOurs((v) => !v)}>
            <Ionicons name={onlyOurs ? 'checkbox' : 'square-outline'} size={16} color={onlyOurs ? theme.red : theme.textMuted} />
            <Text style={styles.filterMiniText}>{t.onlyOurs}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.red} /></View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={visible}
          keyExtractor={(r) => String(r.tmdb_id)}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: 24 }}
          ListFooterComponent={footer}
          ListEmptyComponent={
            (query || service) ? <Text style={styles.faintCenter}>{t.noResults}</Text> : (
              <View style={styles.hint}><Text style={styles.hintText}>{t.searchHint}</Text></View>
            )
          }
        />
      )}

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
     </View>
    </Background>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent', paddingHorizontal: 16 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.surface2,
    borderRadius: radius.md, paddingHorizontal: 12, height: 44, marginTop: 12,
    borderWidth: 1, borderColor: theme.border,
  },
  input: { flex: 1, color: theme.text, fontSize: 15 },
  chipWrap: { height: 50, justifyContent: 'center' },
  chipRow: { gap: 8, paddingRight: 8, alignItems: 'center' },
  svcChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 38,
    borderRadius: 20, backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border,
  },
  svcChipOn: { borderColor: theme.red, backgroundColor: theme.redSoft },
  svcLogo: { width: 22, height: 22, borderRadius: 5, backgroundColor: '#fff' },
  svcText: { color: theme.textMuted, fontSize: 13 },
  svcTextOn: { color: theme.text, fontWeight: '600' },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  sortBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.surface2,
    borderRadius: radius.md, paddingHorizontal: 14, height: 42, borderWidth: 1, borderColor: theme.border,
  },
  sortBtnText: { color: theme.text, fontSize: 14, fontWeight: '500' },
  filterMini: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 32 },
  menu: { backgroundColor: theme.surfaceOpaque, borderRadius: 16, padding: 8, borderWidth: 1, borderColor: theme.border },
  menuTitle: { color: theme.textMuted, fontSize: 12, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 14, borderRadius: 10 },
  menuItemText: { color: theme.text, fontSize: 15 },
  filterMiniText: { color: theme.textMuted, fontSize: 12 },
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
  faintCenter: { color: theme.textFaint, fontSize: 14, textAlign: 'center', marginTop: 40 },
  addBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: theme.red, alignItems: 'center', justifyContent: 'center' },
  addBtnDone: { backgroundColor: theme.green },
  moreBtn: { marginTop: 4, marginBottom: 20, alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 12, borderRadius: radius.md, backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border },
  moreText: { color: theme.text, fontSize: 14, fontWeight: '500' },
  hint: { paddingHorizontal: 8, marginTop: 40 },
  hintText: { color: theme.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 21 },
});
