import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions, ActivityIndicator, Text } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, type SharedValue,
} from 'react-native-reanimated';
import { theme, radius } from './theme';
import { appName } from './i18n';

// Skeleton placeholders in the shape of the real content, pulsing in sync.
function usePulse() {
  const v = useSharedValue(0.35);
  useEffect(() => {
    v.value = withRepeat(withTiming(0.8, { duration: 750, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, []);
  return v;
}

function Bone({ pulse, style }: { pulse: SharedValue<number>; style: any }) {
  const a = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View style={[s.bone, style, a]} />;
}

const GRID_W = Math.floor((Dimensions.get('window').width - 32 - 20) / 3);

export function SkeletonList({ variant = 'list', count = 6, noHeader = false }: {
  variant?: 'list' | 'grid'; count?: number; noHeader?: boolean;
}) {
  const pulse = usePulse();
  return (
    <View style={s.wrap}>
      {noHeader ? null : <Bone pulse={pulse} style={s.header} />}
      {variant === 'grid' ? (
        <View style={s.grid}>
          {Array.from({ length: 9 }, (_, i) => (
            <View key={i} style={{ width: GRID_W }}>
              <Bone pulse={pulse} style={{ width: GRID_W, height: Math.floor(GRID_W * 1.48), borderRadius: 10 }} />
              <Bone pulse={pulse} style={[s.line, { width: GRID_W * 0.8, marginTop: 7 }]} />
            </View>
          ))}
        </View>
      ) : (
        Array.from({ length: count }, (_, i) => (
          <View key={i} style={s.card}>
            <Bone pulse={pulse} style={s.poster} />
            <View style={{ flex: 1, gap: 8 }}>
              <Bone pulse={pulse} style={[s.line, { width: `${70 - (i % 3) * 12}%`, height: 14 }]} />
              <Bone pulse={pulse} style={[s.line, { width: '45%' }]} />
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Bone pulse={pulse} style={s.logo} />
                <Bone pulse={pulse} style={s.logo} />
              </View>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

// Poster rows (For You).
export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  const pulse = usePulse();
  return (
    <View style={{ paddingVertical: 14 }}>
      {Array.from({ length: rows }, (_, r) => (
        <View key={r} style={{ marginBottom: 24 }}>
          <Bone pulse={pulse} style={[s.line, { width: 150, height: 16, marginLeft: 16, marginBottom: 12 }]} />
          <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, overflow: 'hidden' }}>
            {Array.from({ length: 4 }, (_, i) => (
              <View key={i}>
                <Bone pulse={pulse} style={{ width: 112, height: 166, borderRadius: 10 }} />
                <Bone pulse={pulse} style={[s.line, { width: 84, marginTop: 8 }]} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

// Full-screen start-up loader.
export function SplashLoader() {
  return (
    <View style={s.splash}>
      <Text style={s.splashTitle}>{appName}</Text>
      <ActivityIndicator size="large" color={theme.red} style={{ transform: [{ scale: 1.3 }] }} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 16, paddingTop: 8 },
  bone: { backgroundColor: theme.surface2 },
  header: { height: 42, borderRadius: radius.md, marginTop: 10, marginBottom: 12 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.surface,
    borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: theme.border, marginBottom: 12,
  },
  poster: { width: 42, height: 60, borderRadius: 6 },
  line: { height: 10, borderRadius: 5 },
  logo: { width: 22, height: 22, borderRadius: 5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, rowGap: 16 },
  splash: { flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', gap: 28 },
  splashTitle: { color: theme.text, fontFamily: 'BebasNeue_400Regular', fontSize: 44, letterSpacing: 5 },
});
