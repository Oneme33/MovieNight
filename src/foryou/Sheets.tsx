import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Modal, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme, radius } from '../theme';
import { t } from '../i18n';
import type { Rec, RowDef, Status } from './logic';
import { PosterCard, GRID_W } from './PosterCard';

// "More": a whole row as a poster grid, with load-more.
export function MoreSheet({ def, items, added, busy, done, statusOf, onClose, onLoadMore, onOpen, onAction }: {
  def: RowDef | undefined; items: Rec[]; added: Set<number>; busy: boolean; done: boolean;
  statusOf: (r: Rec) => Status | undefined; onClose: () => void; onLoadMore: () => void;
  onOpen: (r: Rec) => void; onAction: (r: Rec) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!def} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={[s.sheet, { paddingTop: insets.top }]}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} style={s.back}>
            <Ionicons name="chevron-back" size={24} color={theme.text} />
          </TouchableOpacity>
          {def ? <Ionicons name={def.icon} size={17} color={theme.red} /> : null}
          <Text style={s.title} numberOfLines={1}>{def?.title}</Text>
        </View>
        <FlatList
          data={items}
          keyExtractor={(r) => `sheet-${r.tmdb_id}`}
          numColumns={3}
          columnWrapperStyle={{ gap: 10 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 + insets.bottom, gap: 16 }}
          renderItem={({ item }) => (
            <PosterCard item={item} width={GRID_W} isAdded={added.has(item.tmdb_id)}
              onPress={() => onOpen(item)} onAction={() => onAction(item)} status={statusOf(item)} />
          )}
          ListFooterComponent={done ? null : (
            <TouchableOpacity style={s.loadMore} onPress={onLoadMore} disabled={busy}>
              {busy ? <ActivityIndicator color={theme.text} /> : <Text style={s.loadMoreText}>{t.loadMore}</Text>}
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>
  );
}

// Long-press / ⋯ on a suggestion: add, already seen, not interested.
export function ActionMenu({ item, isAdded, onClose, onAdd, onSeen, onDismiss }: {
  item: Rec | null; isAdded: boolean; onClose: () => void;
  onAdd: (r: Rec) => void; onSeen: (r: Rec) => void; onDismiss: (r: Rec) => void;
}) {
  const act = (fn: (r: Rec) => void) => () => { const r = item!; onClose(); fn(r); };
  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <View style={s.menu}>
          <Text style={s.menuTitle} numberOfLines={2}>{item?.title}</Text>
          {isAdded ? (
            <View style={s.menuItem}>
              <Ionicons name="checkmark" size={18} color={theme.green} />
              <Text style={[s.menuItemText, { color: theme.textMuted }]}>{t.onList}</Text>
            </View>
          ) : (
            <TouchableOpacity style={s.menuItem} onPress={act(onAdd)}>
              <Ionicons name="add" size={18} color={theme.red} />
              <Text style={s.menuItemText}>{t.addToList}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={s.menuItem} onPress={act(onSeen)}>
            <Ionicons name="eye-outline" size={18} color={theme.text} />
            <Text style={s.menuItemText}>{t.alreadySeen}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.menuItem} onPress={act(onDismiss)}>
            <Ionicons name="eye-off-outline" size={18} color={theme.red} />
            <Text style={[s.menuItemText, { color: theme.red }]}>{t.notInterested}</Text>
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
  sheet: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, height: 56,
    borderBottomWidth: 1, borderBottomColor: theme.border, backgroundColor: theme.surfaceOpaque,
  },
  back: { padding: 8 },
  title: { flex: 1, color: theme.text, fontSize: 17, fontWeight: '600' },
  loadMore: {
    marginTop: 8, alignSelf: 'center', paddingHorizontal: 22, paddingVertical: 12, minWidth: 140, alignItems: 'center',
    borderRadius: radius.md, backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border,
  },
  loadMoreText: { color: theme.text, fontSize: 14, fontWeight: '500' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 28 },
  menu: { backgroundColor: theme.surfaceOpaque, borderRadius: 16, padding: 8, borderWidth: 1, borderColor: theme.border },
  menuTitle: { color: theme.text, fontSize: 15, fontWeight: '600', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 14, borderRadius: 10 },
  menuItemText: { color: theme.text, fontSize: 15 },
  cancel: { alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: theme.border, marginTop: 4 },
  cancelText: { color: theme.textMuted, fontSize: 14 },
});
