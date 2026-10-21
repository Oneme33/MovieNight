import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { theme } from '../theme';
import type { MovieRow } from '../supabase';
import { hypeOf } from '../db';
import { IMG, MovieExtras } from '../tmdb';
import { avg } from './logic';

// Poster tile for the grid view; actions go through the ⋯ button (same pattern as For You).
const GRID_W = Math.floor((Dimensions.get('window').width - 32 - 20) / 3);

export function GridCard({ item, title, ex, onOpen, onAction, myName }: {
  item: MovieRow; title: string; ex?: MovieExtras;
  onOpen: (m: MovieRow) => void; onAction: (m: MovieRow) => void; myName?: string;
}) {
  const poster = item.poster_path ? IMG(item.poster_path, 'w342') : null;
  const myAvg = avg(item.ratings);
  return (
    <TouchableOpacity style={s.wrap} onPress={() => onOpen(item)} onLongPress={() => onAction(item)} delayLongPress={280} activeOpacity={0.85}>
      <View style={s.poster}>
        {poster ? (
          <Image source={{ uri: poster }} style={s.posterImg} />
        ) : (
          <View style={s.posterEmpty}><Ionicons name="film-outline" size={26} color={theme.textFaint} /></View>
        )}
        {item.seen && myAvg > 0 ? (
          <View style={s.badge}>
            <Ionicons name="person" size={9} color={theme.gold} />
            <Text style={s.badgeText}>{Math.round(myAvg * 10) / 10}</Text>
          </View>
        ) : ex?.rating != null ? (
          <View style={s.badge}>
            <Ionicons name="star" size={9} color={theme.gold} />
            <Text style={s.badgeText}>{ex.rating.toFixed(1)}</Text>
          </View>
        ) : null}
        {!item.seen && hypeOf(item, myName).both ? (
          <Animated.View entering={ZoomIn.springify()} style={s.flame}>
            <Ionicons name="flame" size={14} color={theme.flame} />
          </Animated.View>
        ) : null}
        <TouchableOpacity style={s.action} onPress={() => onAction(item)}>
          <Ionicons name="ellipsis-horizontal" size={15} color={theme.red} />
        </TouchableOpacity>
      </View>
      <Text style={s.title} numberOfLines={2}>{title}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
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
