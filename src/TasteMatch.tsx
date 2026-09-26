import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, StyleSheet, Image, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedProps, withTiming, Easing, FadeInDown,
} from 'react-native-reanimated';
import { theme, radius } from './theme';
import { t, uiLang } from './i18n';
import { MovieRow } from './supabase';
import { IMG, MovieExtras, genreName } from './tmdb';
import { hSuccess, hTap } from './haptics';

const MIN_SHARED = 3;

type Duel = { movie: MovieRow; mine: number; theirs: number };
export type TasteMatch =
  | { state: 'none' }
  | { state: 'locked'; partner: string; need: number }
  | {
      state: 'ready'; partner: string; pct: number; n: number; myAvg: number; partnerAvg: number;
      fight?: Duel; love?: Duel; genre?: { name: string; pct: number };
    };

// 1–10 scores: identical ratings = 100%, a 9-point gap = 0%; averaged over shared movies.
const matchPct = (diffs: number[]) =>
  Math.round(100 * (1 - diffs.reduce((a, b) => a + b, 0) / diffs.length / 9));

export function computeTasteMatch(
  movies: MovieRow[], me: string | undefined, extras: Record<number, MovieExtras> = {},
): TasteMatch {
  if (!me) return { state: 'none' };
  const counts = new Map<string, number>();
  movies.forEach((m) => Object.keys(m.ratings ?? {}).forEach((name) => {
    if (name !== me) counts.set(name, (counts.get(name) ?? 0) + 1);
  }));
  const partner = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!partner) return { state: 'none' };

  const shared: Duel[] = movies
    .filter((m) => m.ratings?.[me] != null && m.ratings?.[partner] != null)
    .map((m) => ({ movie: m, mine: m.ratings![me], theirs: m.ratings![partner] }));
  if (shared.length < MIN_SHARED) return { state: 'locked', partner, need: MIN_SHARED - shared.length };

  const diffs = shared.map((d) => Math.abs(d.mine - d.theirs));
  const myAvg = shared.reduce((a, d) => a + d.mine, 0) / shared.length;
  const partnerAvg = shared.reduce((a, d) => a + d.theirs, 0) / shared.length;

  const fight = [...shared].sort((a, b) => Math.abs(b.mine - b.theirs) - Math.abs(a.mine - a.theirs))[0];
  const love = shared
    .filter((d) => d.mine >= 8 && d.theirs >= 8)
    .sort((a, b) => b.mine + b.theirs - (a.mine + a.theirs))[0];

  // Genre you agree on most (needs at least 2 shared movies in that genre).
  const byGenre = new Map<number, number[]>();
  shared.forEach((d) => {
    const ids = d.movie.tmdb_id ? extras[d.movie.tmdb_id]?.genreIds ?? [] : [];
    ids.forEach((g) => byGenre.set(g, [...(byGenre.get(g) ?? []), Math.abs(d.mine - d.theirs)]));
  });
  const genreRanked = [...byGenre.entries()]
    .filter(([id, ds]) => ds.length >= 2 && genreName(id))
    .map(([id, ds]) => ({ name: genreName(id)!, pct: matchPct(ds), n: ds.length }))
    .sort((a, b) => b.pct - a.pct || b.n - a.n);

  return {
    state: 'ready', partner, pct: matchPct(diffs), n: shared.length, myAvg, partnerAvg,
    fight: Math.abs(fight.mine - fight.theirs) >= 3 ? fight : undefined,
    love,
    genre: genreRanked.length >= 2 ? genreRanked[0] : undefined,
  };
}

// Compact card at the top of the Seen tab.
export function TasteMatchCard({ match, onPress }: { match: TasteMatch; onPress: () => void }) {
  if (match.state === 'none') return null;
  const ready = match.state === 'ready';
  return (
    <TouchableOpacity style={s.card} onPress={ready ? onPress : undefined} activeOpacity={ready ? 0.85 : 1}>
      <View style={s.cardIcon}>
        <Ionicons name={ready ? 'heart' : 'lock-closed-outline'} size={18} color={theme.red} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.cardTitle}>{t.tasteTitle} <Text style={s.cardWith}>· {t.tasteWith(match.partner)}</Text></Text>
        <Text style={s.cardSub} numberOfLines={2}>
          {ready ? t.tasteTier(match.pct) : t.tasteLocked(match.need)}
        </Text>
      </View>
      {ready ? (
        <>
          <Text style={s.cardPct}>{match.pct}%</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.textFaint} />
        </>
      ) : null}
    </TouchableOpacity>
  );
}

const SIZE = 180;
const STROKE = 14;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;
const ACircle = Animated.createAnimatedComponent(Circle);
const DURATION = 1200;

function Gauge({ pct, run }: { pct: number; run: boolean }) {
  const progress = useSharedValue(0);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!run) return;
    progress.value = 0;
    progress.value = withTiming(pct / 100, { duration: DURATION, easing: Easing.out(Easing.cubic) });
    // Count the number up alongside the ring.
    const start = Date.now();
    let raf = 0;
    const tick = () => {
      const k = Math.min(1, (Date.now() - start) / DURATION);
      setShown(Math.round(pct * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const done = setTimeout(hSuccess, DURATION);
    return () => { cancelAnimationFrame(raf); clearTimeout(done); };
  }, [run, pct]);

  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: C * (1 - progress.value) }));

  return (
    <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill}>
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={theme.surface2} strokeWidth={STROKE} fill="none" />
        <ACircle
          cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={pct >= 90 ? theme.gold : theme.red} strokeWidth={STROKE}
          fill="none" strokeLinecap="round" strokeDasharray={`${C} ${C}`} animatedProps={animatedProps}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </Svg>
      <Text style={s.gaugePct}>{shown}%</Text>
    </View>
  );
}

function DuelRow({ icon, label, duel, me, partner, title }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; duel: Duel; me: string; partner: string; title: string;
}) {
  const poster = IMG(duel.movie.poster_path, 'w200');
  return (
    <View style={s.duel}>
      {poster ? <Image source={{ uri: poster }} style={s.duelPoster} /> : <View style={s.duelPoster} />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={s.duelLabelRow}>
          <Ionicons name={icon} size={13} color={theme.red} />
          <Text style={s.duelLabel}>{label}</Text>
        </View>
        <Text style={s.duelTitle} numberOfLines={2}>{title}</Text>
        <Text style={s.duelScores}>{me}: {duel.mine}  ·  {partner}: {duel.theirs}</Text>
      </View>
    </View>
  );
}

export function TasteMatchModal({ match, me, visible, onClose, titleOf }: {
  match: TasteMatch; me: string; visible: boolean; onClose: () => void; titleOf: (m: MovieRow) => string;
}) {
  if (match.state !== 'ready') return null;
  const fmt = (n: number) => (uiLang === 'nl' ? n.toFixed(1).replace('.', ',') : n.toFixed(1));
  const gap = match.myAvg - match.partnerAvg;
  const stricter = Math.abs(gap) < 0.3 ? null
    : gap < 0 ? t.tasteStricter(me, fmt(match.myAvg), fmt(match.partnerAvg))
      : t.tasteStricter(match.partner, fmt(match.partnerAvg), fmt(match.myAvg));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet}>
          <ScrollView contentContainerStyle={{ alignItems: 'center' }} showsVerticalScrollIndicator={false}>
            <Text style={s.sheetTitle}>{t.tasteTitle}</Text>
            <Text style={s.sheetWith}>{t.tasteWith(match.partner)}</Text>
            <View style={{ marginTop: 14 }}><Gauge pct={match.pct} run={visible} /></View>
            <Animated.Text entering={FadeInDown.delay(DURATION - 200).duration(300)} style={s.tier}>
              {t.tasteTier(match.pct)}
            </Animated.Text>
            <Text style={s.basis}>{t.tasteBasis(match.n)}</Text>

            <View style={s.facts}>
              <View style={s.fact}>
                <Ionicons name="ribbon-outline" size={16} color={theme.gold} />
                <Text style={s.factText}>{stricter ?? t.tasteEqual}</Text>
              </View>
              {match.genre ? (
                <View style={s.fact}>
                  <Ionicons name="pricetag-outline" size={16} color={theme.gold} />
                  <Text style={s.factText}>{t.tasteGenre(match.genre.name, match.genre.pct)}</Text>
                </View>
              ) : null}
              {match.love ? (
                <DuelRow icon="heart" label={t.tasteLove} duel={match.love} me={me} partner={match.partner} title={titleOf(match.love.movie)} />
              ) : null}
              {match.fight ? (
                <DuelRow icon="flash-outline" label={t.tasteFight} duel={match.fight} me={me} partner={match.partner} title={titleOf(match.fight.movie)} />
              ) : null}
            </View>

            <TouchableOpacity style={s.closeBtn} onPress={() => { hTap(); onClose(); }}>
              <Text style={s.closeText}>{t.close}</Text>
            </TouchableOpacity>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10, padding: 12,
    borderRadius: radius.md, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.redDark,
  },
  cardIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.redSoft, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: theme.text, fontSize: 15, fontWeight: '600' },
  cardWith: { color: theme.textMuted, fontWeight: '400', fontSize: 13 },
  cardSub: { color: theme.textMuted, fontSize: 12, marginTop: 2 },
  cardPct: { color: theme.red, fontFamily: 'BebasNeue_400Regular', fontSize: 32, letterSpacing: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  sheet: { maxHeight: '90%', backgroundColor: theme.surfaceOpaque, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: theme.border },
  sheetTitle: { color: theme.text, fontFamily: 'BebasNeue_400Regular', fontSize: 32, letterSpacing: 3 },
  sheetWith: { color: theme.textMuted, fontSize: 14 },
  gaugePct: { color: theme.text, fontFamily: 'BebasNeue_400Regular', fontSize: 56, letterSpacing: 1 },
  tier: { color: theme.text, fontSize: 18, fontWeight: '700', marginTop: 14, textAlign: 'center' },
  basis: { color: theme.textFaint, fontSize: 12, marginTop: 4, textAlign: 'center' },
  facts: { alignSelf: 'stretch', marginTop: 18, gap: 10 },
  fact: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md,
    backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border,
  },
  factText: { flex: 1, color: theme.text, fontSize: 13, lineHeight: 18 },
  duel: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.md,
    backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border,
  },
  duelPoster: { width: 40, height: 58, borderRadius: 6, backgroundColor: theme.surface },
  duelLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  duelLabel: { color: theme.red, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  duelTitle: { color: theme.text, fontSize: 14, fontWeight: '600', marginTop: 2 },
  duelScores: { color: theme.textMuted, fontSize: 12, marginTop: 2 },
  closeBtn: {
    alignSelf: 'stretch', marginTop: 18, height: 48, borderRadius: radius.md, backgroundColor: theme.red,
    alignItems: 'center', justifyContent: 'center',
  },
  closeText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
