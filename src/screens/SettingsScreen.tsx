import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { theme, radius } from '../theme';
import { Background } from '../Background';
import { t } from '../i18n';
import { useSession } from '../ListContext';

const LANGS: { key: 'en' | 'nl' | 'original'; label: string }[] = [
  { key: 'en', label: t.langEn },
  { key: 'nl', label: t.langNl },
  { key: 'original', label: t.langOriginal },
];

export default function SettingsScreen() {
  const { session, titleLang, updateName, setTitleLang, clearSession } = useSession();
  const [name, setName] = useState(session?.memberName ?? '');
  const [saved, setSaved] = useState(false);

  const onSave = async () => {
    if (!name.trim()) return Alert.alert(t.errName);
    await updateName(name.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const copyCode = async () => {
    if (!session) return;
    await Clipboard.setStringAsync(session.code);
    Alert.alert(t.copied, t.copiedBody(session.code));
  };

  const shareCode = async () => {
    if (!session) return;
    await Share.share({ message: t.shareMsg(session.code) });
  };

  const onUnlink = () => {
    Alert.alert(t.unlinkQ, t.unlinkBody, [
      { text: t.cancel, style: 'cancel' },
      { text: t.unlink, style: 'destructive', onPress: () => clearSession() },
    ]);
  };

  return (
    <Background>
     <View style={styles.container}>
      <Text style={styles.section}>{t.yourName}</Text>
      <Text style={styles.hint}>{t.nameHint}</Text>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={t.namePlaceholder}
          placeholderTextColor={theme.textFaint}
          autoCapitalize="words"
        />
        <TouchableOpacity style={styles.saveBtn} onPress={onSave}>
          <Ionicons name={saved ? 'checkmark' : 'save-outline'} size={20} color={theme.text} />
        </TouchableOpacity>
      </View>

      <Text style={[styles.section, { marginTop: 28 }]}>{t.pairCode}</Text>
      <Text style={styles.hint}>{t.codeHint}</Text>
      <View style={styles.codeBox}>
        <Text style={styles.code}>{session?.code}</Text>
        <View style={styles.codeActions}>
          <TouchableOpacity style={styles.smallBtn} onPress={copyCode}>
            <Ionicons name="copy-outline" size={18} color={theme.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.smallBtn} onPress={shareCode}>
            <Ionicons name="share-social-outline" size={18} color={theme.text} />
          </TouchableOpacity>
        </View>
      </View>

      <Text style={[styles.section, { marginTop: 28 }]}>{t.langSection}</Text>
      <Text style={styles.hint}>{t.langHint}</Text>
      <View style={styles.langRow}>
        {LANGS.map((l) => (
          <TouchableOpacity
            key={l.key}
            style={[styles.langChip, titleLang === l.key && styles.langChipOn]}
            onPress={() => setTitleLang(l.key)}
          >
            <Text style={[styles.langText, titleLang === l.key && styles.langTextOn]}>{l.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.unlink} onPress={onUnlink}>
        <Ionicons name="exit-outline" size={18} color={theme.red} />
        <Text style={styles.unlinkText}>{t.unlink}</Text>
      </TouchableOpacity>
     </View>
    </Background>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent', padding: 16 },
  section: { color: theme.text, fontSize: 16, fontWeight: '600', marginBottom: 4 },
  hint: { color: theme.textMuted, fontSize: 13, marginBottom: 10 },
  row: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1, backgroundColor: theme.surface2, borderRadius: radius.md, height: 48,
    paddingHorizontal: 14, color: theme.text, fontSize: 16, borderWidth: 1, borderColor: theme.border,
  },
  saveBtn: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: theme.red, alignItems: 'center', justifyContent: 'center' },
  codeBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: theme.surface, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: theme.border,
  },
  code: { color: theme.red, fontSize: 26, fontWeight: '700', letterSpacing: 4 },
  codeActions: { flexDirection: 'row', gap: 8 },
  smallBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: theme.surface2, alignItems: 'center', justifyContent: 'center' },
  langRow: { flexDirection: 'row', gap: 8 },
  langChip: {
    flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.md,
    backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border,
  },
  langChipOn: { backgroundColor: theme.red, borderColor: theme.red },
  langText: { color: theme.textMuted, fontSize: 14 },
  langTextOn: { color: '#fff', fontWeight: '600' },
  unlink: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 36, padding: 12 },
  unlinkText: { color: theme.red, fontSize: 15 },
});
