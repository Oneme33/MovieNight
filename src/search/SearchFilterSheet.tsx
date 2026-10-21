import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Modal, Pressable, Switch } from 'react-native';
import { theme, radius } from '../theme';
import { t } from '../i18n';
import { LENGTH_OPTIONS } from '../tmdb';
import { GenreDropdown } from '../GenreDropdown';
import { DEFAULT_FILTERS, SearchFilters } from './logic';

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
const str = (n: number | null) => (n ? String(n) : '');

// Browse filters. Years are typed as drafts and applied when the field or the sheet is left.
export function SearchFilterSheet({ visible, value, onChange, onClose }: {
  visible: boolean; value: SearchFilters; onChange: (f: SearchFilters) => void; onClose: () => void;
}) {
  const [fromDraft, setFromDraft] = useState(str(value.yearFrom));
  const [toDraft, setToDraft] = useState(str(value.yearTo));
  useEffect(() => { if (visible) { setFromDraft(str(value.yearFrom)); setToDraft(str(value.yearTo)); } }, [visible]);

  const set = (patch: Partial<SearchFilters>) => onChange({ ...value, ...patch });
  const commitYears = (fromS = fromDraft, toS = toDraft) => {
    let a = parseYear(fromS);
    let b = parseYear(toS);
    if (a && b && a > b) [a, b] = [b, a];
    set({ yearFrom: a, yearTo: b });
    setFromDraft(str(a)); setToDraft(str(b));
  };
  const close = () => { commitYears(); onClose(); };
  const toggle = (label: string, on: boolean, onToggle: (v: boolean) => void) => (
    <View style={s.switchRow}>
      <Text style={s.label}>{label}</Text>
      <Switch value={on} onValueChange={onToggle} trackColor={{ true: theme.red, false: theme.surface2 }} thumbColor="#fff" />
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={s.backdrop}>
        {/* Tap-outside layer sits behind the sheet, so it never competes with scrolling. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <View style={s.sheet}>
          <View style={s.headerRow}>
            <Text style={s.header}>{t.filters}</Text>
            <TouchableOpacity onPress={() => { onChange(DEFAULT_FILTERS); setFromDraft(''); setToDraft(''); }}>
              <Text style={s.clear}>{t.clear}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={s.label}>{t.lengthLabel}</Text>
            <View style={s.wrapRow}>
              {LENGTH_OPTIONS.map((l) => (
                <TouchableOpacity key={l.key} style={[s.chip, value.length === l.key && s.chipOn]} onPress={() => set({ length: l.key })}>
                  <Text style={[s.chipText, value.length === l.key && s.chipTextOn]}>{l.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.label}>{t.yearLabel}</Text>
            <View style={s.yearRow}>
              <TextInput
                style={s.yearInput} value={fromDraft} onChangeText={setFromDraft}
                onEndEditing={() => commitYears()} keyboardType="number-pad" maxLength={4}
                placeholder={t.yearFrom} placeholderTextColor={theme.textFaint}
              />
              <Text style={s.yearDash}>–</Text>
              <TextInput
                style={s.yearInput} value={toDraft} onChangeText={setToDraft}
                onEndEditing={() => commitYears()} keyboardType="number-pad" maxLength={4}
                placeholder={t.yearTo} placeholderTextColor={theme.textFaint}
              />
            </View>
            <View style={[s.wrapRow, { marginTop: 8 }]}>
              {YEAR_PRESETS.map((p) => {
                const on = fromDraft === str(p.from) && toDraft === str(p.to);
                return (
                  <TouchableOpacity
                    key={p.label} style={[s.chip, on && s.chipOn]}
                    onPress={() => (on ? commitYears('', '') : commitYears(str(p.from), str(p.to)))}
                  >
                    <Text style={[s.chipText, on && s.chipTextOn]}>{p.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {toggle(t.kids, value.kids, (kids) => set({ kids }))}

            <Text style={s.label}>{t.genreLabel}</Text>
            <GenreDropdown value={value.genres} onChange={(genres) => set({ genres })} />

            {toggle(t.hideSeen, value.hideSeen, (hideSeen) => set({ hideSeen }))}
            {toggle(t.hideListed, value.hideListed, (hideListed) => set({ hideListed }))}
          </ScrollView>
          <TouchableOpacity style={s.apply} onPress={close}>
            <Text style={s.applyText}>{t.apply}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 28 },
  sheet: { maxHeight: '88%', backgroundColor: theme.surfaceOpaque, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.border },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  header: { color: theme.text, fontSize: 17, fontWeight: '600' },
  clear: { color: theme.red, fontSize: 14 },
  label: { color: theme.textMuted, fontSize: 13, marginBottom: 8, marginTop: 10 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border },
  chipOn: { backgroundColor: theme.red, borderColor: theme.red },
  chipText: { color: theme.textMuted, fontSize: 13 },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  yearRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  yearInput: {
    flex: 1, height: 42, borderRadius: radius.md, backgroundColor: theme.surface2, borderWidth: 1,
    borderColor: theme.border, color: theme.text, fontSize: 15, textAlign: 'center',
  },
  yearDash: { color: theme.textMuted, fontSize: 16 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  apply: { marginTop: 18, backgroundColor: theme.red, borderRadius: radius.md, height: 48, alignItems: 'center', justifyContent: 'center' },
  applyText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
