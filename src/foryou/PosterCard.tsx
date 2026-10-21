import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';
import { IMG } from '../tmdb';
import type { Rec, Status } from './logic';

// Width of a poster in the 3-column "More" grid.
export const GRID_W = Math.floor((Dimensions.get('window').width - 32 - 20) / 3);

export function PosterCard({ item, isAdded, onPress, onAction, status, width = 112 }: {
  item: Rec; isAdded: boolean; onPress: () => void; onAction: () => void; status?: Status; width?: number;
}) {
  const poster = IMG(item.poster_path, 'w342');
  const size = { width, height: Math.round(width * 1.48) };
  return (
    <TouchableOpacity style={{ width }} onPress={onPress} onLongPress={onAction} delayLongPress={280} activeOpacity={0.85}>
      <View style={[pc.poster, size]}>
        {poster ? (
          <Image source={{ uri: poster }} style={size} />
        ) : (
          <View style={pc.posterEmpty}><Ionicons name="film-outline" size={28} color={theme.textFaint} /></View>
        )}
        {item.rating != null ? (
          <View style={pc.badge}>
            <Ionicons name="star" size={10} color={theme.gold} />
            <Text style={pc.badgeText}>{item.rating.toFixed(1)}</Text>
          </View>
        ) : null}
        <TouchableOpacity style={[pc.action, isAdded && pc.actionDone]} onPress={onAction}>
          <Ionicons name={isAdded ? 'checkmark' : 'ellipsis-horizontal'} size={16} color={isAdded ? theme.green : theme.red} />
        </TouchableOpacity>
      </View>
      <Text style={pc.title} numberOfLines={2}>{item.title}</Text>
      {status ? <Text style={[pc.status, { color: status.color }]} numberOfLines={1}>{status.text}</Text> : null}
    </TouchableOpacity>
  );
}

const pc = StyleSheet.create({
  poster: {
    width: 112, height: 166, borderRadius: 10, backgroundColor: theme.surface2,
    overflow: 'hidden', borderWidth: 1, borderColor: theme.border,
  },
  posterEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute', top: 6, left: 6, flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(12,8,7,0.75)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  action: {
    position: 'absolute', bottom: 6, right: 6, width: 28, height: 28, borderRadius: 8,
    borderWidth: 1.5, borderColor: theme.red, backgroundColor: 'rgba(12,8,7,0.72)',
    alignItems: 'center', justifyContent: 'center',
  },
  actionDone: { borderColor: theme.green },
  title: { color: theme.textMuted, fontSize: 12, lineHeight: 16, marginTop: 6 },
  status: { fontSize: 11, fontWeight: '600', marginTop: 3 },
});
