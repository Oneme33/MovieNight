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
  // dark scrim — subtle enough to see the photo, dark enough for readability
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16,11,10,0.55)' },
});
