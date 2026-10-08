import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius } from './theme';
import { t } from './i18n';
import { GENRE_OPTIONS, GenreFilter, NO_GENRES } from './tmdb';
import { hSelect } from './haptics';

// Inline multi-select dropdown (no nested modal), so it works inside the filter sheets.
// With 2+ genres you choose whether a movie needs one of them or all of them.
export function GenreDropdown({ value, onChange }: { value: GenreFilter; onChange: (f: GenreFilter) => void }) {
  const [open, setOpen] = useState(false);
  const { ids, all } = value;
  const active = ids.length > 0;
  const names = GENRE_OPTIONS.filter((g) => ids.includes(g.id)).map((g) => g.name);
  const label = !active ? t.allGenres
    : names.length <= 2 ? names.join(all ? ' + ' : ', ')
      : `${names.slice(0, 2).join(all ? ' + ' : ', ')} +${names.length - 2}`;

  const toggle = (id: number) => {
    hSelect();
    onChange({ ...value, ids: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] });
  };
  const clear = () => { hSelect(); onChange(NO_GENRES); };
  const setAll = (next: boolean) => { if (next !== all) { hSelect(); onChange({ ...value, all: next }); } };

  return (
    <View>
      <TouchableOpacity style={[s.button, active && s.buttonOn]} onPress={() => setOpen((o) => !o)} activeOpacity={0.85}>
        <Ionicons name="pricetag-outline" size={15} color={active ? theme.text : theme.textMuted} />
        <Text style={[s.buttonText, active && { color: theme.text, fontWeight: '600' }]} numberOfLines={1}>
          {label}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textMuted} />
      </TouchableOpacity>
      {open && ids.length >= 2 ? (
        <View style={s.modeRow}>
          {[false, true].map((m) => (
            <TouchableOpacity key={String(m)} style={[s.modeChip, all === m && s.modeChipOn]} onPress={() => setAll(m)}>
              <Text style={[s.modeText, all === m && s.modeTextOn]}>{m ? t.genreMatchAll : t.genreMatchAny}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      {open ? (
        <View style={s.list}>
          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
            <TouchableOpacity style={s.item} onPress={clear}>
              <Text style={[s.itemText, !active && { color: theme.red, fontWeight: '600' }]}>{t.allGenres}</Text>
              {!active ? <Ionicons name="checkmark" size={17} color={theme.red} /> : null}
            </TouchableOpacity>
            {GENRE_OPTIONS.map((g) => {
              const on = ids.includes(g.id);
              return (
                <TouchableOpacity key={g.id} style={s.item} onPress={() => toggle(g.id)}>
                  <Text style={[s.itemText, on && { color: theme.red, fontWeight: '600' }]}>{g.name}</Text>
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={19} color={on ? theme.red : theme.textFaint} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  button: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 14,
    borderRadius: radius.md, backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border,
  },
  buttonOn: { borderColor: theme.red, backgroundColor: theme.redSoft },
  buttonText: { flex: 1, color: theme.textMuted, fontSize: 14 },
  modeRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  modeChip: {
    flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.sm,
    backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border,
  },
  modeChipOn: { borderColor: theme.red, backgroundColor: theme.redSoft },
  modeText: { color: theme.textMuted, fontSize: 13 },
  modeTextOn: { color: theme.text, fontWeight: '600' },
  list: {
    marginTop: 6, maxHeight: 260, borderRadius: radius.md, backgroundColor: theme.surface2,
    borderWidth: 1, borderColor: theme.border, overflow: 'hidden',
  },
  item: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border,
  },
  itemText: { color: theme.text, fontSize: 14 },
});
