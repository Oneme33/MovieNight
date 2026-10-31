import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Modal, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing, FadeIn, FadeInDown, ZoomIn, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated';
import ConfettiCannon from 'react-native-confetti-cannon';
import { hTap, hMedium, hHeavy, hSuccess } from '../haptics';
import { theme, radius } from '../theme';
import { t } from '../i18n';
import type { MovieRow } from '../supabase';
import { IMG } from '../tmdb';
import { ws } from './styles';

const SPIN_MS = 3000;
const SPIN_STEPS = 30;
const POSTER_H = 192;

type Spin = { seq: number[]; winner: MovieRow };

// Movie roulette: 10s countdown → a continuous reel that decelerates onto the winner.
export function Roulette({ visible, candidates, titleOf, onClose }: {
  visible: boolean; candidates: MovieRow[]; titleOf: (m: MovieRow) => string; onClose: () => void;
}) {
  const [countdown, setCountdown] = useState(10);
  const [result, setResult] = useState<MovieRow | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [spinIdx, setSpinIdx] = useState(0);
  const [spin, setSpin] = useState<Spin | null>(null);
  // Refs keep the countdown independent of re-renders (extras arrive in batches, so the
  // candidates array changes while the countdown runs).
  const candidatesRef = useRef(candidates);
  candidatesRef.current = candidates;
  const spinningRef = useRef(false);
  const startSpinRef = useRef<() => void>(() => {});
  const reelPos = useSharedValue(0);
  const reelStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -reelPos.value }] }));

  const stopSpin = useCallback(() => {
    cancelAnimation(reelPos);
    reelPos.value = 0;
    spinningRef.current = false;
    setSpinning(false);
  }, [reelPos]);

  // Reset once it's closed, so the next opening starts a fresh round without a flash of the old one.
  useEffect(() => {
    if (visible) return;
    stopSpin();
    setSpin(null);
    setSpinIdx(0);
    setResult(null);
    setCountdown(10);
  }, [visible, stopSpin]);

  const close = () => { stopSpin(); onClose(); };

  const finishSpin = useCallback((winner: MovieRow) => {
    spinningRef.current = false;
    setResult(winner);
    setSpinning(false);
    hSuccess();
  }, []);

  const startSpin = useCallback(() => {
    const list = candidatesRef.current;
    if (!list.length || spinningRef.current) return;
    spinningRef.current = true;
    setSpinning(true);
    setCountdown((c) => Math.min(c, 3)); // spin covers the final 3 seconds
    hMedium();
    const winnerIdx = Math.floor(Math.random() * list.length);
    const winner = list[winnerIdx];
    const seq = Array.from({ length: SPIN_STEPS }, () => Math.floor(Math.random() * list.length));
    seq[seq.length - 1] = winnerIdx;
    setSpin({ seq, winner });
  }, []);
  startSpinRef.current = startSpin;

  // One continuous animation on the UI thread (no per-tick re-renders or timers).
  useEffect(() => {
    if (!visible || !spin) return;
    reelPos.value = 0;
    reelPos.value = withTiming((spin.seq.length - 1) * POSTER_H, {
      duration: SPIN_MS,
      easing: Easing.out(Easing.cubic),
    }, (finished) => {
      if (finished) runOnJS(finishSpin)(spin.winner);
    });
  }, [spin, visible, reelPos, finishSpin]);

  // Gentle poster carousel while the countdown runs (teases the candidates).
  useEffect(() => {
    if (!visible || result || spinning) return;
    const iv = setInterval(() => setSpinIdx((p) => p + 1), 450);
    return () => clearInterval(iv);
  }, [visible, result, spinning]);

  useEffect(() => {
    if (!visible || result) return;
    if (countdown === 3 && !spinningRef.current) startSpinRef.current(); // acceleration kicks in at 3…
    if (countdown <= 0) return; // …and the reveal lands exactly on 0
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [visible, result, countdown]);

  // Final countdown you can feel: 5 → one light tap … 1 → five heavy thumps, then the reveal.
  useEffect(() => {
    if (!visible || result || countdown < 1 || countdown > 5) return;
    const hit = countdown >= 4 ? hTap : countdown >= 2 ? hMedium : hHeavy;
    const timers = Array.from({ length: 6 - countdown }, (_, i) => setTimeout(hit, i * 90));
    return () => timers.forEach(clearTimeout);
  }, [countdown, visible, result]);

  const teaser = candidates.length ? candidates[spinIdx % candidates.length] : null;
  const poster = (m: MovieRow | undefined, style: any) => (
    m?.poster_path ? (
      <Image source={{ uri: IMG(m.poster_path, 'w342')! }} style={style} />
    ) : (
      <View style={[style, s.spinPosterEmpty]}>
        <Ionicons name="film-outline" size={36} color={theme.textFaint} />
      </View>
    )
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={ws.backdrop}>
        {result ? (
          <ConfettiCannon count={100} origin={{ x: Dimensions.get('window').width / 2, y: -10 }} fadeOut explosionSpeed={350} fallSpeed={2600} />
        ) : null}
        <View style={s.sheet}>
          <Text style={s.title}>{t.randomTitle}</Text>
          {!result ? (
            <>
              <View style={s.spinFrame}>
                {spinning && spin ? (
                  <Animated.View style={reelStyle}>
                    {spin.seq.map((idx, i) => (
                      <View key={i} style={s.reelItem}>
                        {poster(candidates.length ? candidates[idx % candidates.length] : undefined, s.spinPoster)}
                      </View>
                    ))}
                  </Animated.View>
                ) : teaser ? (
                  <Animated.View key={spinIdx} entering={FadeIn.duration(80)}>
                    {poster(teaser, s.spinPoster)}
                  </Animated.View>
                ) : null}
              </View>
              <Text style={s.count}>{countdown}</Text>
              <Text style={s.hint}>{t.randomHint}</Text>
              {!spinning ? (
                <View style={s.btns}>
                  <TouchableOpacity style={s.ghost} onPress={close}>
                    <Text style={s.ghostText}>{t.cancel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.primary} onPress={startSpin}>
                    <Ionicons name="dice" size={18} color="#fff" />
                    <Text style={s.primaryText}>{t.randomNow}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </>
          ) : (
            <>
              <Text style={s.hint}>{t.randomResult}</Text>
              <Animated.View entering={ZoomIn.springify().damping(11)} style={s.resultWrap}>
                <View style={s.resultPoster}>
                  {poster(result, s.resultPosterImg)}
                </View>
              </Animated.View>
              <Animated.View entering={FadeInDown.delay(200).duration(300)}>
                <Text style={s.resultTitle}>{titleOf(result)}</Text>
                {result.year ? <Text style={[s.hint, { textAlign: 'center' }]}>{result.year}</Text> : null}
              </Animated.View>
              <View style={s.btns}>
                <TouchableOpacity style={s.ghost} onPress={() => { setResult(null); setSpin(null); setCountdown(10); }}>
                  <Ionicons name="refresh" size={16} color={theme.text} />
                  <Text style={s.ghostText}>{t.randomAgain}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.primary} onPress={close}>
                  <Text style={s.primaryText}>{t.close}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  sheet: { backgroundColor: theme.surfaceOpaque, borderRadius: 16, padding: 22, borderWidth: 1, borderColor: theme.border, alignItems: 'center' },
  title: { color: theme.text, fontSize: 30, fontFamily: 'BebasNeue_400Regular', letterSpacing: 3 },
  count: { color: theme.red, fontSize: 56, fontFamily: 'BebasNeue_400Regular', marginVertical: 2 },
  spinFrame: {
    width: 130, height: POSTER_H, borderRadius: 12, marginTop: 14, overflow: 'hidden',
    borderWidth: 2, borderColor: theme.redSoft, backgroundColor: theme.surface2,
  },
  reelItem: { height: POSTER_H, alignItems: 'center', justifyContent: 'center' },
  spinPoster: { width: 126, height: 188, borderRadius: 10 },
  spinPosterEmpty: { alignItems: 'center', justifyContent: 'center' },
  resultWrap: { marginTop: 14 },
  hint: { color: theme.textMuted, fontSize: 14, textAlign: 'center', marginTop: 2 },
  btns: { flexDirection: 'row', gap: 10, marginTop: 20, alignSelf: 'stretch' },
  ghost: { flex: 1, flexDirection: 'row', gap: 6, height: 48, borderRadius: radius.md, backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
  ghostText: { color: theme.text, fontSize: 15, fontWeight: '500' },
  primary: { flex: 1, flexDirection: 'row', gap: 6, height: 48, borderRadius: radius.md, backgroundColor: theme.red, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  resultPoster: { width: 150, height: 222, borderRadius: 12, backgroundColor: theme.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 2, borderColor: theme.red },
  resultPosterImg: { width: 150, height: 222 },
  resultTitle: { color: theme.text, fontSize: 19, fontWeight: '700', textAlign: 'center', marginTop: 12 },
});
