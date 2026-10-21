import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius } from '../theme';
import { t } from '../i18n';
import { IMG, LOGO, SearchResult } from '../tmdb';

// One search/browse result: poster, rating, genre, runtime, your services, and the + button.
export function ResultCard({ item, isAdded, onOpen, onAdd }: {
  item: SearchResult; isAdded: boolean; onOpen: (r: SearchResult) => void; onAdd: (r: SearchResult) => void;
}) {
  const poster = IMG(item.poster_path, 'w200');
  return (
    <TouchableOpacity style={s.card} activeOpacity={0.85} onPress={() => onOpen(item)}>
      <View style={s.poster}>
        {poster ? <Image source={{ uri: poster }} style={s.posterImg} />
          : <Ionicons name="film-outline" size={22} color={theme.textFaint} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.title} numberOfLines={2}>
          {item.title} {item.year ? <Text style={s.year}>({item.year})</Text> : null}
        </Text>
        <View style={s.subRow}>
          {item.rating != null ? (
            <View style={s.rating}><Ionicons name="star" size={12} color={theme.gold} /><Text style={s.ratingText}>{item.rating.toFixed(1)}</Text></View>
          ) : null}
          {item.genre ? <Text style={s.genre}>{item.genre}</Text> : null}
          {item.runtime ? <Text style={s.genre}>· {item.runtime} min</Text> : null}
        </View>
        <View style={s.badges}>
          {!item.providersLoaded ? <Text style={s.faint}>{t.providersLoading}</Text>
            : item.ours.length ? item.ours.map((p) => {
              const l = LOGO(p.logo_path);
              return l ? <Image key={p.key} source={{ uri: l }} style={s.logo} /> : null;
            }) : <Text style={s.faint}>{item.hasFlatrate ? t.notOnServices : t.notStreamable}</Text>}
        </View>
      </View>
      <TouchableOpacity style={[s.addBtn, isAdded && s.addBtnDone]} onPress={() => onAdd(item)} disabled={isAdded}>
        <Ionicons name={isAdded ? 'checkmark' : 'add'} size={20} color={isAdded ? theme.green : theme.red} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
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
  addBtn: {
    width: 38, height: 38, borderRadius: radius.md, borderWidth: 1.5, borderColor: theme.red,
    backgroundColor: 'rgba(225,29,42,0.10)', alignItems: 'center', justifyContent: 'center',
  },
  addBtnDone: { borderColor: theme.green, backgroundColor: 'rgba(63,178,127,0.10)' },
});
