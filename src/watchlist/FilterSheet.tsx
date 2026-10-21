import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, Switch } from 'react-native';
import { theme, radius } from '../theme';
import { t } from '../i18n';
import { LENGTH_OPTIONS } from '../tmdb';
import { GenreDropdown } from '../GenreDropdown';
import { NO_FILTERS, WatchFilters } from './logic';
import { ws } from './styles';

// Watchlist filters: length, hyped by both, kid-friendly, genres.
export function FilterSheet({ visible, value, onChange, onClose }: {
  visible: boolean; value: WatchFilters; onChange: (f: WatchFilters) => void; onClose: () => void;
}) {
  const set = (patch: Partial<WatchFilters>) => onChange({ ...value, ...patch });
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={ws.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={s.sheet}>
          <View style={s.headerRow}>
            <Text style={s.header}>{t.filters}</Text>
            <TouchableOpacity onPress={() => onChange(NO_FILTERS)}>
              <Text style={s.clear}>{t.clear}</Text>
            </TouchableOpacity>
          </View>

          <Text style={s.label}>{t.lengthLabel}</Text>
          <View style={s.wrapRow}>
            {LENGTH_OPTIONS.map((l) => (
              <TouchableOpacity key={l.key} style={[s.chip, value.length === l.key && s.chipOn]} onPress={() => set({ length: l.key })}>
                <Text style={[s.chipText, value.length === l.key && s.chipTextOn]}>{l.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={s.switchRow}>
            <Text style={s.label}>{t.hypeFilter}</Text>
            <Switch value={value.hype} onValueChange={(hype) => set({ hype })} trackColor={{ true: theme.flame, false: theme.surface2 }} thumbColor="#fff" />
          </View>

          <View style={s.switchRow}>
            <Text style={s.label}>{t.kids}</Text>
            <Switch value={value.kids} onValueChange={(kids) => set({ kids })} trackColor={{ true: theme.red, false: theme.surface2 }} thumbColor="#fff" />
          </View>

          <Text style={s.label}>{t.genreLabel}</Text>
          <GenreDropdown value={value.genres} onChange={(genres) => set({ genres })} />

          <TouchableOpacity style={s.apply} onPress={onClose}>
            <Text style={s.applyText}>{t.apply}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  sheet: { backgroundColor: theme.surfaceOpaque, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.border },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  header: { color: theme.text, fontSize: 17, fontWeight: '600' },
  clear: { color: theme.red, fontSize: 14 },
  label: { color: theme.textMuted, fontSize: 13, marginBottom: 8, marginTop: 10 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border },
  chipOn: { backgroundColor: theme.red, borderColor: theme.red },
  chipText: { color: theme.textMuted, fontSize: 13 },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  apply: { marginTop: 18, backgroundColor: theme.red, borderRadius: radius.md, height: 48, alignItems: 'center', justifyContent: 'center' },
  applyText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
