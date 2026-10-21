import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { theme, radius } from './theme';
import { t } from './i18n';
import { DOWNLOAD_PAGE, useUpdate } from './version';

// "New version available" — opens the download page; can be dismissed per version.
const DISMISSED = 'filmavond.updateDismissed';

export function UpdateBanner() {
  const update = useUpdate();
  const [dismissed, setDismissed] = useState<string | null | undefined>(undefined);
  useEffect(() => { AsyncStorage.getItem(DISMISSED).then(setDismissed).catch(() => setDismissed(null)); }, []);
  if (!update || dismissed === undefined || dismissed === update.version) return null;
  const dismiss = () => {
    setDismissed(update.version);
    AsyncStorage.setItem(DISMISSED, update.version).catch(() => {});
  };
  return (
    <Animated.View entering={FadeInDown.duration(250)} style={s.banner}>
      <TouchableOpacity style={s.main} onPress={() => Linking.openURL(DOWNLOAD_PAGE).catch(() => {})} activeOpacity={0.85}>
        <Ionicons name="arrow-down-circle" size={18} color={theme.green} />
        <Text style={s.text} numberOfLines={2}>{t.updateAvailable(update.version)}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={dismiss} style={{ padding: 4 }} accessibilityLabel={t.close}>
        <Ionicons name="close" size={16} color={theme.textMuted} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 6,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md,
    backgroundColor: 'rgba(63,178,127,0.12)', borderWidth: 1, borderColor: 'rgba(63,178,127,0.45)',
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { flex: 1, color: theme.text, fontSize: 13 },
});
