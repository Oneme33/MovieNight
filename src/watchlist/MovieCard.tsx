import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { TouchableOpacity as GHTouchable } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, type SharedValue, ZoomIn } from 'react-native-reanimated';
import { theme, radius } from '../theme';
import { t } from '../i18n';
import type { MovieRow } from '../supabase';
import { hypeOf } from '../db';
import { IMG, LOGO, MovieExtras } from '../tmdb';

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
        style={[s.actionBtn, { backgroundColor: props.color, height: props.height || undefined }]}
        onPress={props.onPress}
      >
        <Ionicons name={props.icon} size={22} color="#fff" />
        <Text style={s.actionText}>{props.label}</Text>
      </GHTouchable>
    </Animated.View>
  );
}

// Stable card component (defined outside the screen → swipe stays smooth).
export type CardProps = {
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
  me?: string; // your member id
  nameOf: (key: string) => string;
  addedBy: string;
};

export const MovieCard = React.memo(function MovieCard(p: CardProps) {
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
  const h = hypeOf(item, p.me);

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
        style={[s.card, isActive && s.cardActive]}
        onPress={() => p.onOpen(item)}
        onLongPress={canDrag ? drag : undefined}
        delayLongPress={200}
        activeOpacity={0.9}
        onLayout={(e) => setRowH(e.nativeEvent.layout.height)}
      >
        {!item.seen ? <View style={s.rank}><Text style={s.rankText}>{index + 1}</Text></View> : null}
        <View style={s.poster}>
          {item.poster_path ? <Image source={{ uri: IMG(item.poster_path, 'w200')! }} style={s.posterImg} />
            : <Ionicons name="film-outline" size={22} color={theme.textFaint} />}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.title} numberOfLines={2}>{title}</Text>
          <View style={s.subRow}>
            {ex?.rating != null ? (
              <View style={s.rating}><Ionicons name="star" size={12} color={theme.gold} /><Text style={s.ratingText}>{ex.rating.toFixed(1)}</Text></View>
            ) : null}
            {item.year ? <Text style={s.meta}>{item.year}</Text> : null}
            {ex?.genres?.[0] ? <Text style={s.meta}>· {ex.genres[0]}</Text> : null}
            {ex?.runtime ? <Text style={s.meta}>· {ex.runtime} min</Text> : null}
          </View>
          {item.seen ? (
            <View style={s.ourRatings}>
              {ratingPairs.map(([key, score]) => {
                const mine = key === p.me;
                return (
                  <TouchableOpacity key={key} style={s.ourRating} disabled={!mine} onPress={() => p.onRate(item)}>
                    <Ionicons name="person" size={10} color={theme.textMuted} />
                    <Text style={s.ourRatingText}>{p.nameOf(key)}: {score}</Text>
                    {mine ? <Ionicons name="pencil" size={9} color={theme.textFaint} /> : null}
                  </TouchableOpacity>
                );
              })}
              {p.me && (item.ratings ?? {})[p.me] == null ? (
                <TouchableOpacity style={[s.ourRating, s.rateChip]} onPress={() => p.onRate(item)}>
                  <Ionicons name="star-outline" size={10} color={theme.gold} />
                  <Text style={s.rateChipText}>{t.giveRating}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (ex?.ours?.length || p.addedBy) ? (
            <View style={s.logos}>
              {ex?.ours?.map((pr) => { const l = LOGO(pr.logo_path); return l ? <Image key={pr.key} source={{ uri: l }} style={s.logo} /> : null; })}
              {p.addedBy ? (
                <View style={s.byChip}>
                  <Ionicons name="person-outline" size={9} color={theme.textFaint} />
                  <Text style={s.byChipText}>{p.addedBy}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
        {!item.seen ? (
          <TouchableOpacity
            style={[s.hypeBtn, h.both && s.hypeBtnMatch]} onPress={() => p.onHype(item)}
            hitSlop={8} accessibilityLabel={h.mine ? t.hypeOff : t.hypeOn}
          >
            <Animated.View key={h.both ? 'match' : 'single'} entering={h.both ? ZoomIn.springify() : undefined}>
              <Ionicons
                name={h.mine || h.both ? 'flame' : 'flame-outline'} size={h.both ? 20 : 18}
                color={h.both ? theme.flame : h.mine ? 'rgba(255,122,26,0.7)' : theme.textFaint}
              />
            </Animated.View>
          </TouchableOpacity>
        ) : null}
        {canDrag ? <Ionicons name="reorder-three" size={22} color={theme.textFaint} /> : null}
      </TouchableOpacity>
    </ReanimatedSwipeable>
  );
});

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.surface, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: theme.border },
  cardActive: { borderColor: theme.red, backgroundColor: theme.surface2 },
  rank: { width: 24, height: 24, borderRadius: 8, backgroundColor: theme.redSoft, alignItems: 'center', justifyContent: 'center' },
  rankText: { color: theme.red, fontWeight: '700', fontSize: 12 },
  poster: { width: 42, height: 60, borderRadius: 6, backgroundColor: theme.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  posterImg: { width: 42, height: 60 },
  title: { color: theme.text, fontSize: 15, fontWeight: '600' },
  subRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 3 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingText: { color: theme.gold, fontSize: 12, fontWeight: '600' },
  hypeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  hypeBtnMatch: { backgroundColor: theme.flameSoft, borderWidth: 1, borderColor: theme.flame },
  meta: { color: theme.textMuted, fontSize: 12 },
  logos: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  logo: { width: 22, height: 22, borderRadius: 5, backgroundColor: '#fff' },
  byChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 4,
    backgroundColor: theme.surface2, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3,
    borderWidth: 1, borderColor: theme.border,
  },
  byChipText: { color: theme.textFaint, fontSize: 10 },
  ourRatings: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  ourRating: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: theme.surface2, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  ourRatingText: { color: theme.text, fontSize: 11 },
  rateChip: { borderWidth: 1, borderColor: theme.gold, backgroundColor: 'rgba(245,179,1,0.08)' },
  rateChipText: { color: theme.gold, fontSize: 11, fontWeight: '600' },
  actionBtn: { width: 92, justifyContent: 'center', alignItems: 'center', borderRadius: radius.md },
  actionText: { color: '#fff', fontSize: 12, marginTop: 2 },
});
