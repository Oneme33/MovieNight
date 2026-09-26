import React, { useEffect, useState } from 'react';
import {
  View, Text, Image, Modal, Pressable, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius } from './theme';
import { t } from './i18n';
import { getMovieExtras, IMG, LOGO, MovieExtras, OUR_PROVIDERS } from './tmdb';
import type { TitleLang } from './ListContext';

export type DetailTarget = {
  tmdb_id: number;
  title: string;
  year?: number | null;
  poster_path?: string | null;
} | null;

// Shared movie detail sheet: overview, runtime, genres, services and trailer link.
export function MovieDetails({ target, lang, onClose }: {
  target: DetailTarget;
  lang: TitleLang;
  onClose: () => void;
}) {
  const [extras, setExtras] = useState<MovieExtras | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExtras(null);
    setExpanded(false);
    if (!target) return;
    let cancelled = false;
    getMovieExtras(target.tmdb_id, lang).then((ex) => { if (!cancelled) setExtras(ex); });
    return () => { cancelled = true; };
  }, [target, lang]);

  if (!target) return null;
  const poster = IMG(target.poster_path ?? null, 'w342');
  const title = extras?.title || target.title;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.topRow}>
              <View style={styles.poster}>
                {poster ? <Image source={{ uri: poster }} style={styles.posterImg} />
                  : <Ionicons name="film-outline" size={30} color={theme.textFaint} />}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.title}>{title}</Text>
                <View style={styles.metaRow}>
                  {target.year ? <Text style={styles.meta}>{target.year}</Text> : null}
                  {extras?.runtime ? <Text style={styles.meta}>· {extras.runtime} min</Text> : null}
                  {extras?.rating != null ? (
                    <View style={styles.rating}>
                      <Ionicons name="star" size={13} color={theme.gold} />
                      <Text style={styles.ratingText}>{extras.rating.toFixed(1)}</Text>
                    </View>
                  ) : null}
                </View>
                {extras?.genres?.length ? (
                  <Text style={styles.genres}>{extras.genres.join(' · ')}</Text>
                ) : null}
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            {!extras ? (
              <ActivityIndicator size="large" color={theme.red} style={{ marginVertical: 28 }} />
            ) : (
              <>
                {extras.overview ? (
                  <>
                    <Text style={styles.overview} numberOfLines={expanded ? undefined : 5}>
                      {extras.overview}
                    </Text>
                    {extras.overview.length > 220 ? (
                      <TouchableOpacity onPress={() => setExpanded((v) => !v)}>
                        <Text style={styles.readMore}>{expanded ? t.readLess : t.readMore}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </>
                ) : null}

                {extras.ours.length ? (
                  <>
                    <Text style={styles.watchOnLabel}>{t.watchOn}</Text>
                    <View style={styles.watchRow}>
                      {extras.ours.map((p) => {
                        const prov = OUR_PROVIDERS.find((x) => x.key === p.key);
                        const l = LOGO(p.logo_path);
                        if (!prov) return null;
                        return (
                          <TouchableOpacity
                            key={p.key}
                            style={styles.watchBtn}
                            onPress={() => Linking.openURL(prov.watch(title))}
                          >
                            {l ? <Image source={{ uri: l }} style={styles.watchLogo} /> : null}
                            <Text style={styles.watchText}>{p.key}</Text>
                            <Ionicons name="play" size={14} color="#fff" />
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                ) : null}

                <View style={styles.linksRow}>
                  {extras.trailerKey ? (
                    <TouchableOpacity
                      style={styles.link}
                      onPress={() => Linking.openURL(`https://www.youtube.com/watch?v=${extras.trailerKey}`)}
                    >
                      <Ionicons name="logo-youtube" size={15} color={theme.textMuted} />
                      <Text style={styles.linkText}>{t.trailer}</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={styles.link}
                    onPress={() => Linking.openURL(`https://www.themoviedb.org/movie/${target.tmdb_id}`)}
                  >
                    <Ionicons name="open-outline" size={15} color={theme.textMuted} />
                    <Text style={styles.linkText}>{t.moreTmdb}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  sheet: {
    backgroundColor: theme.surfaceOpaque, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: theme.border, maxHeight: '82%',
  },
  topRow: { flexDirection: 'row', gap: 14 },
  poster: { width: 92, height: 136, borderRadius: 8, backgroundColor: theme.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  posterImg: { width: 92, height: 136 },
  title: { color: theme.text, fontSize: 18, fontWeight: '700', paddingRight: 26 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  meta: { color: theme.textMuted, fontSize: 13 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingText: { color: theme.gold, fontSize: 13, fontWeight: '600' },
  genres: { color: theme.textMuted, fontSize: 12, marginTop: 6 },
  closeBtn: { position: 'absolute', right: -4, top: -4, padding: 6 },
  overview: { color: theme.text, fontSize: 14, lineHeight: 21, marginTop: 14 },
  readMore: { color: theme.red, fontSize: 13, fontWeight: '600', marginTop: 6 },
  watchOnLabel: { color: theme.textMuted, fontSize: 13, marginTop: 18, marginBottom: 8 },
  watchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  watchBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 46,
    borderRadius: radius.md, backgroundColor: theme.red,
  },
  watchLogo: { width: 24, height: 24, borderRadius: 6, backgroundColor: '#fff' },
  watchText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  linksRow: { flexDirection: 'row', justifyContent: 'center', gap: 24, paddingVertical: 16 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  linkText: { color: theme.textMuted, fontSize: 13 },
});
