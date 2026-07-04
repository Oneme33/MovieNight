import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Share, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { theme, radius } from '../theme';
import { Background } from '../Background';
import QRCode from 'react-native-qrcode-svg';
import { t } from '../i18n';
import { useSession } from '../ListContext';
import { leaveList } from '../db';

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
      {
        text: t.unlink,
        style: 'destructive',
        onPress: async () => {
          if (session) { try { await leaveList(session.listId); } catch {} }
          clearSession();
        },
      },
    ]);
  };

  return (
    <Background>
     <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
      <View style={styles.pairCard}>
        <View style={styles.codeRow}>
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
        <View style={styles.pairDivider} />
        <Text style={styles.qrHint}>{t.qrShow}</Text>
        {session?.code ? (
          <View style={styles.qrBox}>
            <QRCode value={`MNIGHT:${session.code}`} size={148} backgroundColor="#ffffff" color="#111111" />
          </View>
        ) : null}
        <View style={styles.pairDivider} />
        <TouchableOpacity style={styles.unlinkInline} onPress={onUnlink}>
          <Ionicons name="exit-outline" size={18} color={theme.red} />
          <Text style={styles.unlinkText}>{t.unlink}</Text>
        </TouchableOpacity>
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

     </ScrollView>
    </Background>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: 16, paddingBottom: 48 },
  section: { color: theme.text, fontSize: 16, fontWeight: '600', marginBottom: 4 },
  hint: { color: theme.textMuted, fontSize: 13, marginBottom: 10 },
  row: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1, backgroundColor: theme.surface2, borderRadius: radius.md, height: 48,
    paddingHorizontal: 14, color: theme.text, fontSize: 16, borderWidth: 1, borderColor: theme.border,
  },
  saveBtn: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: theme.red, alignItems: 'center', justifyContent: 'center' },
  pairCard: {
    backgroundColor: theme.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.border,
    padding: 14, alignItems: 'center',
  },
  codeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  pairDivider: { height: 1, backgroundColor: theme.border, alignSelf: 'stretch', marginVertical: 14 },
  code: { color: theme.red, fontSize: 21, fontWeight: '700', letterSpacing: 3 },
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
  qrWrap: { alignItems: 'center', marginTop: 16 },
  qrHint: { color: theme.textMuted, fontSize: 13, marginBottom: 10, textAlign: 'center' },
  qrBox: { backgroundColor: '#fff', padding: 12, borderRadius: 12 },
  unlinkInline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 6 },
  unlinkText: { color: theme.red, fontSize: 15 },
});
