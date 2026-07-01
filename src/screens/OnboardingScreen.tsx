import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius } from '../theme';
import { t, appName } from '../i18n';
import { useSession } from '../ListContext';
import { createList, findListByCode } from '../db';

type Mode = 'choose' | 'create' | 'join';

export default function OnboardingScreen() {
  const { setSession } = useSession();
  const [mode, setMode] = useState<Mode>('choose');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const doCreate = async () => {
    if (!name.trim()) return Alert.alert(t.errName);
    setBusy(true);
    try {
      const list = await createList('Our watchlist');
      await setSession({ listId: list.id, code: list.code, memberName: name.trim() });
    } catch (e: any) {
      Alert.alert(t.somethingWrong, e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const doJoin = async () => {
    if (!name.trim()) return Alert.alert(t.errName);
    if (!code.trim()) return Alert.alert(t.errCode);
    setBusy(true);
    try {
      const list = await findListByCode(code);
      if (!list) {
        Alert.alert(t.codeNotFound, t.codeNotFoundBody);
        return;
      }
      await setSession({ listId: list.id, code: list.code, memberName: name.trim() });
    } catch (e: any) {
      Alert.alert(t.somethingWrong, e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.logo}>
        <Ionicons name="film" size={36} color={theme.red} />
      </View>
      <Text style={styles.title}>{appName}</Text>
      <Text style={styles.sub}>{t.tagline}</Text>

      {mode === 'choose' && (
        <View style={styles.block}>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setMode('create')}>
            <Ionicons name="add-circle-outline" size={20} color={theme.text} />
            <Text style={styles.primaryText}>{t.newList}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => setMode('join')}>
            <Ionicons name="enter-outline" size={20} color={theme.text} />
            <Text style={styles.secondaryText}>{t.joinCode}</Text>
          </TouchableOpacity>
        </View>
      )}

      {mode !== 'choose' && (
        <View style={styles.block}>
          <Text style={styles.label}>{t.yourName}</Text>
          <TextInput
            style={styles.input}
            placeholder={t.namePlaceholder}
            placeholderTextColor={theme.textFaint}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />

          {mode === 'join' && (
            <>
              <Text style={styles.label}>{t.pairCode}</Text>
              <TextInput
                style={[styles.input, styles.codeInput]}
                placeholder="ABC123"
                placeholderTextColor={theme.textFaint}
                value={code}
                onChangeText={(v) => setCode(v.toUpperCase())}
                autoCapitalize="characters"
                maxLength={6}
              />
            </>
          )}

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={mode === 'create' ? doCreate : doJoin}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={theme.text} />
            ) : (
              <Text style={styles.primaryText}>
                {mode === 'create' ? t.createList : t.join}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setMode('choose')} style={styles.backBtn}>
            <Text style={styles.backText}>{t.back}</Text>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  logo: {
    width: 76, height: 76, borderRadius: 24, backgroundColor: theme.redSoft,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  title: { color: theme.text, fontSize: 44, fontFamily: 'BebasNeue_400Regular', letterSpacing: 4 },
  sub: { color: theme.textMuted, fontSize: 15, marginTop: 4, marginBottom: 32 },
  block: { width: '100%', maxWidth: 340, gap: 12 },
  label: { color: theme.textMuted, fontSize: 13, marginTop: 8, marginBottom: -4 },
  input: {
    backgroundColor: theme.surface2, borderRadius: radius.md, height: 48,
    paddingHorizontal: 14, color: theme.text, fontSize: 16,
    borderWidth: 1, borderColor: theme.border,
  },
  codeInput: { letterSpacing: 6, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  primaryBtn: {
    flexDirection: 'row', gap: 8, backgroundColor: theme.red, borderRadius: radius.md,
    height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  primaryText: { color: theme.text, fontSize: 16, fontWeight: '600' },
  secondaryBtn: {
    flexDirection: 'row', gap: 8, backgroundColor: theme.surface2, borderRadius: radius.md,
    height: 50, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.border,
  },
  secondaryText: { color: theme.text, fontSize: 16, fontWeight: '600' },
  backBtn: { alignItems: 'center', paddingVertical: 10 },
  backText: { color: theme.textMuted, fontSize: 14 },
});
