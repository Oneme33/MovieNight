import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import Animated, { FadeOut, FadeInDown, SlideOutRight, SlideOutLeft, LinearTransition } from 'react-native-reanimated';
import { hTap, hMedium, hSelect } from '../haptics';
import { theme, radius } from '../theme';
import { Background } from '../Background';
import { t } from '../i18n';
import { useSession } from '../ListContext';
import type { MovieRow } from '../supabase';
import { SkeletonList } from '../Loader';
import { computeTasteMatch, TasteMatchCard, TasteMatchModal } from '../TasteMatch';
import { MovieDetails, DetailTarget } from '../MovieDetails';
import { useWatchlist } from '../watchlist/useWatchlist';
import { SORTS, SEEN_SORTS, SortMode, SeenSort, NO_FILTERS, WatchFilters, filterCount, unseenList, seenList } from '../watchlist/logic';
import { MovieCard } from '../watchlist/MovieCard';
import { GridCard } from '../watchlist/GridCard';
import { Roulette } from '../watchlist/Roulette';
import { FilterSheet } from '../watchlist/FilterSheet';
import { OptionMenu, RatingModal, GridActionMenu } from '../watchlist/Menus';
import { UpdateBanner } from '../UpdateBanner';

const Separator = () => <View style={{ height: 12 }} />;
const GridSeparator = () => <View style={{ height: 16 }} />;

export default function WatchlistScreen() {
  const { session, titleLang, nameOf, refreshMembers } = useSession();
  const me = session?.memberId;
  const w = useWatchlist(session, titleLang, nameOf, refreshMembers);
  const [tab, setTab] = useState<'watch' | 'seen'>('watch');
  const [sort, setSort] = useState<SortMode>('nieuw');
  const [seenSort, setSeenSort] = useState<SeenSort>('datum');
  const [filters, setFilters] = useState<WatchFilters>(NO_FILTERS);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [menuOpen, setMenuOpen] = useState(false);
  const [seenMenuOpen, setSeenMenuOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [rouletteOpen, setRouletteOpen] = useState(false);
  const [tasteOpen, setTasteOpen] = useState(false);
  const [ratingFor, setRatingFor] = useState<MovieRow | null>(null);
  const [gridActionFor, setGridActionFor] = useState<MovieRow | null>(null);
  const [detailFor, setDetailFor] = useState<DetailTarget>(null);

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

  const unseen = useMemo(
    () => unseenList(w.movies, w.extras, filters, sort, w.displayTitle),
    [w.movies, w.extras, filters, sort, w.displayTitle]
  );
  const seen = useMemo(() => seenList(w.movies, seenSort, w.displayTitle), [w.movies, seenSort, w.displayTitle]);
  const taste = useMemo(() => computeTasteMatch(w.movies, me, w.extras, nameOf), [w.movies, me, w.extras, nameOf]);

  const onMarkSeen = useCallback((m: MovieRow) => { hTap(); setRatingFor(m); }, []);
  const onOpen = useCallback((m: MovieRow) => {
    if (!m.tmdb_id) return;
    setDetailFor({ tmdb_id: m.tmdb_id, title: m.title, year: m.year, poster_path: m.poster_path });
  }, []);
  const chooseScore = (score: number | null) => {
    const m = ratingFor;
    setRatingFor(null);
    if (m) w.rate(m, score);
  };

  const sortButton = (label: string, onPress: () => void) => (
    <TouchableOpacity style={s.sortBtn} onPress={onPress} activeOpacity={0.8}>
      <Ionicons name="swap-vertical" size={16} color={theme.text} />
      <Text style={s.sortBtnText} numberOfLines={1}>{label}</Text>
      <Ionicons name="chevron-down" size={16} color={theme.textMuted} />
    </TouchableOpacity>
  );
  const tabButton = (key: 'watch' | 'seen', icon: keyof typeof Ionicons.glyphMap, label: string) => (
    <TouchableOpacity style={[s.tab, tab === key && s.tabOn]} onPress={() => { hSelect(); setTab(key); }} activeOpacity={0.85}>
      <Ionicons name={icon} size={16} color={tab === key ? '#fff' : theme.textMuted} />
      <Text style={[s.tabText, tab === key && s.tabTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
  const nFilters = filterCount(filters);
  const viewToggleBtn = (
    <TouchableOpacity style={s.squareBtn} onPress={toggleView} activeOpacity={0.85}>
      <Ionicons name={viewMode === 'list' ? 'grid-outline' : 'list-outline'} size={19} color={theme.text} />
    </TouchableOpacity>
  );
  const watchHeader = (
    <View style={s.headerRow}>
      <View style={{ flex: 1 }}>{sortButton(SORTS.find((o) => o.key === sort)!.label, () => setMenuOpen(true))}</View>
      {viewToggleBtn}
      <TouchableOpacity style={[s.squareBtn, nFilters > 0 && s.squareBtnOn]} onPress={() => setFilterOpen(true)} activeOpacity={0.85}>
        <Ionicons name="options-outline" size={20} color={nFilters > 0 ? '#fff' : theme.text} />
        {nFilters > 0 ? <View style={s.badgeDot}><Text style={s.badgeDotText}>{nFilters}</Text></View> : null}
      </TouchableOpacity>
    </View>
  );
  const seenHeader = (
    <View>
      <TasteMatchCard match={taste} onPress={() => { hTap(); setTasteOpen(true); }} />
      <View style={s.headerRow}>
        <View style={{ flex: 1 }}>{sortButton(SEEN_SORTS.find((o) => o.key === seenSort)!.label, () => setSeenMenuOpen(true))}</View>
        {viewToggleBtn}
      </View>
    </View>
  );
  const emptyWatch = (
    <View style={s.empty}>
      <Text style={s.emptyTitle}>{t.emptyTitle}</Text>
      <Text style={s.emptyText}>{t.emptyBody}</Text>
    </View>
  );
  const emptySeen = <View style={s.empty}><Text style={s.emptyText}>{t.seenEmpty}</Text></View>;
  const refreshControl = <RefreshControl refreshing={w.refreshing} onRefresh={w.onRefresh} tintColor={theme.red} colors={[theme.red]} />;
  const exOf = (m: MovieRow) => (m.tmdb_id ? w.extras[m.tmdb_id] : undefined);
  const card = (item: MovieRow, index: number, drag?: { drag: () => void; isActive: boolean }) => (
    <MovieCard item={item} index={index} title={w.displayTitle(item)} ex={exOf(item)}
      canDrag={!!drag} drag={drag?.drag} isActive={drag?.isActive}
      onDelete={w.onDelete} onUnsee={w.onUnsee} onMarkSeen={onMarkSeen} onOpen={onOpen}
      onRate={onMarkSeen} onHype={w.onHype} me={me} nameOf={nameOf} addedBy={w.addedBy(item)} />
  );
  const listProps = { ItemSeparatorComponent: Separator, contentContainerStyle: s.listContent, refreshControl };

  return (
    <Background>
      <View style={s.tabsBar}>
        {tabButton('watch', 'film-outline', `${t.toWatch} (${unseen.length})`)}
        {tabButton('seen', 'eye-outline', `${t.seen} (${seen.length})`)}
      </View>
      <UpdateBanner />
      {w.newsMsg ? (
        <Animated.View entering={FadeInDown.duration(250)} style={s.newsBanner}>
          <Ionicons name="notifications-outline" size={16} color={theme.red} />
          <Text style={s.newsText} numberOfLines={2}>{w.newsMsg}</Text>
          <TouchableOpacity onPress={w.dismissNews} style={{ padding: 4 }}>
            <Ionicons name="close" size={16} color={theme.textMuted} />
          </TouchableOpacity>
        </Animated.View>
      ) : null}
      {w.loading ? (
        <SkeletonList variant={viewMode} />
      ) : viewMode === 'grid' ? (
        <FlatList
          key={`grid-${tab}`}
          data={tab === 'watch' ? unseen : seen}
          keyExtractor={(m) => m.id}
          numColumns={3}
          columnWrapperStyle={{ gap: 10 }}
          renderItem={({ item }) => (
            <GridCard item={item} title={w.displayTitle(item)} ex={exOf(item)} onOpen={onOpen}
              onAction={(m) => { hTap(); setGridActionFor(m); }} myName={me} />
          )}
          ItemSeparatorComponent={GridSeparator}
          ListHeaderComponent={tab === 'watch' ? watchHeader : seenHeader}
          ListEmptyComponent={tab === 'watch' ? emptyWatch : emptySeen}
          contentContainerStyle={s.listContent}
          refreshControl={refreshControl}
        />
      ) : tab === 'watch' && sort === 'handmatig' ? (
        <DraggableFlatList
          data={unseen}
          keyExtractor={(m) => m.id}
          renderItem={({ item, drag, isActive, getIndex }: RenderItemParams<MovieRow>) => (
            <ScaleDecorator>{card(item, getIndex() ?? 0, { drag, isActive })}</ScaleDecorator>
          )}
          onDragEnd={({ data }) => w.reorder(data)}
          ListHeaderComponent={watchHeader}
          ListEmptyComponent={emptyWatch}
          {...listProps}
        />
      ) : (
        <Animated.FlatList
          key={`list-${tab}`}
          data={tab === 'watch' ? unseen : seen}
          keyExtractor={(m: MovieRow) => m.id}
          renderItem={({ item, index }: { item: MovieRow; index: number }) => (
            <Animated.View entering={FadeInDown.duration(220)} exiting={(tab === 'watch' ? SlideOutRight : SlideOutLeft).duration(240)}>
              {card(item, index)}
            </Animated.View>
          )}
          itemLayoutAnimation={LinearTransition.duration(180)}
          ListHeaderComponent={tab === 'watch' ? watchHeader : seenHeader}
          ListEmptyComponent={tab === 'watch' ? emptyWatch : emptySeen}
          {...listProps}
        />
      )}

      {tab === 'watch' && unseen.length > 0 && !w.loading ? (
        <TouchableOpacity style={s.fab} onPress={() => { hMedium(); setRouletteOpen(true); }} activeOpacity={0.85}>
          <Ionicons name="dice-outline" size={26} color="#fff" />
        </TouchableOpacity>
      ) : null}

      {w.toast ? (
        <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOut.duration(200)} style={s.toast} pointerEvents="none">
          <Ionicons name="notifications" size={14} color={theme.red} />
          <Text style={s.toastText} numberOfLines={2}>{w.toast}</Text>
        </Animated.View>
      ) : null}

      <OptionMenu visible={menuOpen} options={SORTS} value={sort} onPick={setSort} onClose={() => setMenuOpen(false)} />
      <OptionMenu visible={seenMenuOpen} options={SEEN_SORTS} value={seenSort} onPick={setSeenSort} onClose={() => setSeenMenuOpen(false)} />
      <RatingModal movie={ratingFor} titleOf={w.displayTitle} onScore={chooseScore} onClose={() => setRatingFor(null)} />
      <FilterSheet visible={filterOpen} value={filters} onChange={setFilters} onClose={() => setFilterOpen(false)} />
      <GridActionMenu
        movie={gridActionFor} me={me} titleOf={w.displayTitle} onClose={() => setGridActionFor(null)}
        onMarkSeen={onMarkSeen} onHype={w.onHype} onUnsee={w.onUnsee} onDelete={w.onDelete}
      />
      <Roulette visible={rouletteOpen} candidates={unseen} titleOf={w.displayTitle} onClose={() => setRouletteOpen(false)} />
      <TasteMatchModal match={taste} me={session?.memberName ?? ''} visible={tasteOpen} onClose={() => setTasteOpen(false)} titleOf={w.displayTitle} />
      <MovieDetails target={detailFor} lang={titleLang} onClose={() => setDetailFor(null)} />
    </Background>
  );
}

const s = StyleSheet.create({
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
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, marginBottom: 12, backgroundColor: theme.surface2, borderRadius: radius.md, paddingHorizontal: 14, height: 42, borderWidth: 1, borderColor: theme.border },
  sortBtnText: { flex: 1, color: theme.text, fontSize: 14, fontWeight: '500' },
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
  empty: { alignItems: 'center', marginTop: 50, paddingHorizontal: 24 },
  emptyTitle: { color: theme.text, fontSize: 17, fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  emptyText: { color: theme.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 21 },
});
