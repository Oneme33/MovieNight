import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';
import { t } from '../i18n';
import type { MovieRow } from '../supabase';
import { hypeOf } from '../db';
import { ws } from './styles';

// A "sort by" menu: a list of options with an optional icon, the current one ticked.
export function OptionMenu<K extends string>({ visible, options, value, onPick, onClose }: {
  visible: boolean; options: { key: K; label: string; icon?: keyof typeof Ionicons.glyphMap }[];
  value: K; onPick: (k: K) => void; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={ws.backdrop} onPress={onClose}>
        <View style={ws.menu}>
          <Text style={ws.menuTitle}>{t.sortBy}</Text>
          {options.map((o) => {
            const on = o.key === value;
            return (
              <TouchableOpacity key={o.key} style={ws.menuItem} onPress={() => { onPick(o.key); onClose(); }}>
                {o.icon ? <Ionicons name={o.icon} size={18} color={on ? theme.red : theme.textMuted} /> : null}
                <Text style={[ws.menuItemText, on && ws.menuItemOn]}>{o.label}</Text>
                {on ? <Ionicons name="checkmark" size={18} color={theme.red} style={{ marginLeft: 'auto' }} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </Pressable>
    </Modal>
  );
}

// "What did you think of …?" — 1 to 10, or mark watched without a rating.
export function RatingModal({ movie, titleOf, onScore, onClose }: {
  movie: MovieRow | null; titleOf: (m: MovieRow) => string; onScore: (score: number | null) => void; onClose: () => void;
}) {
  return (
    <Modal visible={!!movie} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={ws.backdrop} onPress={onClose}>
        <View style={ws.menu}>
          <Text style={s.rateTitle}>{t.rateTitle}{'\n'}"{movie ? titleOf(movie) : ''}"?</Text>
          <View style={s.scoreGrid}>
            {[[1, 2, 3, 4, 5], [6, 7, 8, 9, 10]].map((row, ri) => (
              <View key={ri} style={s.scoreRow}>
                {row.map((n) => (
                  <TouchableOpacity key={n} style={s.scoreBtn} onPress={() => onScore(n)}>
                    <Text style={s.scoreText}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>
          <TouchableOpacity style={s.skipBtn} onPress={() => onScore(null)}>
            <Text style={s.skipText}>{t.rateSkip}</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

// The ⋯ menu on a grid poster.
export function GridActionMenu({ movie, me, titleOf, onClose, onMarkSeen, onHype, onUnsee, onDelete }: {
  movie: MovieRow | null; me?: string; titleOf: (m: MovieRow) => string; onClose: () => void;
  onMarkSeen: (m: MovieRow) => void; onHype: (m: MovieRow) => void; onUnsee: (m: MovieRow) => void; onDelete: (m: MovieRow) => void;
}) {
  const act = (fn: (m: MovieRow) => void) => () => { const m = movie!; onClose(); fn(m); };
  const hyped = movie ? hypeOf(movie, me).mine : false;
  return (
    <Modal visible={!!movie} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={ws.backdrop} onPress={onClose}>
        <View style={ws.menu}>
          <Text style={s.gridTitle} numberOfLines={2}>{movie ? titleOf(movie) : ''}</Text>
          {movie && !movie.seen ? (
            <>
              <TouchableOpacity style={ws.menuItem} onPress={act(onMarkSeen)}>
                <Ionicons name="checkmark-done" size={18} color={theme.green} />
                <Text style={ws.menuItemText}>{t.actionSeen}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={ws.menuItem} onPress={act(onHype)}>
                <Ionicons name={hyped ? 'flame' : 'flame-outline'} size={18} color={theme.flame} />
                <Text style={ws.menuItemText}>{hyped ? t.hypeOff : t.hypeOn}</Text>
              </TouchableOpacity>
            </>
          ) : null}
          {movie?.seen ? (
            <>
              <TouchableOpacity style={ws.menuItem} onPress={act(onMarkSeen)}>
                <Ionicons name="star-outline" size={18} color={theme.gold} />
                <Text style={ws.menuItemText}>{me && (movie.ratings ?? {})[me] != null ? t.editRating : t.giveRating}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={ws.menuItem} onPress={act(onUnsee)}>
                <Ionicons name="arrow-undo" size={18} color={theme.text} />
                <Text style={ws.menuItemText}>{t.backToList}</Text>
              </TouchableOpacity>
            </>
          ) : null}
          <TouchableOpacity style={ws.menuItem} onPress={act(onDelete)}>
            <Ionicons name="trash-outline" size={18} color={theme.red} />
            <Text style={[ws.menuItemText, { color: theme.red }]}>{t.actionDelete}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.cancel} onPress={onClose}>
            <Text style={s.cancelText}>{t.cancel}</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  rateTitle: { color: theme.text, fontSize: 16, fontWeight: '600', textAlign: 'center', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 14, lineHeight: 22 },
  scoreGrid: { paddingHorizontal: 8 },
  scoreRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 10 },
  scoreBtn: { width: 50, height: 48, borderRadius: 10, backgroundColor: theme.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.border },
  scoreText: { color: theme.text, fontSize: 18, fontWeight: '600' },
  skipBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 8 },
  skipText: { color: theme.textMuted, fontSize: 14 },
  gridTitle: { color: theme.text, fontSize: 15, fontWeight: '600', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 },
  cancel: { alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: theme.border, marginTop: 4 },
  cancelText: { color: theme.textMuted, fontSize: 14 },
});
