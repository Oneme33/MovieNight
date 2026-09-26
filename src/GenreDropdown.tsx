import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius } from './theme';
import { t } from './i18n';
import { GENRE_OPTIONS } from './tmdb';
import { hSelect } from './haptics';

// Inline dropdown (no nested modal), so it works inside the filter sheets.
export function GenreDropdown({ value, onChange }: { value: number | null; onChange: (id: number | null) => void }) {
  const [open, setOpen] = useState(false);
  const current = GENRE_OPTIONS.find((g) => g.id === value);
  const pick = (id: number | null) => { hSelect(); onChange(id); setOpen(false); };
  const options: { id: number | null; name: string }[] = [{ id: null, name: t.allGenres }, ...GENRE_OPTIONS];

  return (
    <View>
      <TouchableOpacity style={[s.button, value != null && s.buttonOn]} onPress={() => setOpen((o) => !o)} activeOpacity={0.85}>
        <Ionicons name="pricetag-outline" size={15} color={value != null ? theme.text : theme.textMuted} />
        <Text style={[s.buttonText, value != null && { color: theme.text, fontWeight: '600' }]} numberOfLines={1}>
          {current?.name ?? t.allGenres}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textMuted} />
      </TouchableOpacity>
      {open ? (
        <View style={s.list}>
          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {options.map((g) => {
              const on = g.id === value;
              return (
                <TouchableOpacity key={String(g.id)} style={s.item} onPress={() => pick(g.id)}>
                  <Text style={[s.itemText, on && { color: theme.red, fontWeight: '600' }]}>{g.name}</Text>
                  {on ? <Ionicons name="checkmark" size={17} color={theme.red} /> : null}
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
  list: {
    marginTop: 6, maxHeight: 230, borderRadius: radius.md, backgroundColor: theme.surface2,
    borderWidth: 1, borderColor: theme.border, overflow: 'hidden',
  },
  item: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border,
  },
  itemText: { color: theme.text, fontSize: 14 },
});
