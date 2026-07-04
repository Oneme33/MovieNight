import React from 'react';
import { ImageBackground, View, StyleSheet } from 'react-native';
import { theme } from './theme';

// Cinema mood photo as background, with a dark scrim so text stays readable.
const bg = require('../assets/background.jpg');

export function Background({ children }: { children: React.ReactNode }) {
  return (
    <ImageBackground source={bg} style={styles.root} resizeMode="cover">
      <View style={styles.scrim} pointerEvents="none" />
      {children}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  // Strong dark overlay + blur: the photo becomes soft ambiance, UI comes first.
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,7,6,0.82)' },
});
