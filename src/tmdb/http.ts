// TMDB plumbing shared by the other tmdb/ modules (not re-exported from index.ts).
import { TMDB_TOKEN } from '../config';
import { uiLang } from '../i18n';
import type { TitleLang } from '../ListContext';

export const BASE = 'https://api.themoviedb.org/3';

// Which TMDB language do we request? For 'original' we request English and use original_title.
export const apiLang = (lang: TitleLang) => (lang === 'nl' ? 'nl-NL' : 'en-US');
export const pickTitle = (lang: TitleLang, title: string, original: string) =>
  lang === 'original' ? original || title : title || original;

export const headers = {
  Authorization: `Bearer ${TMDB_TOKEN}`,
  accept: 'application/json',
};

// Genre names in both UI languages; always shown in the UI language (never mixed).
const GENRES_NL: Record<number, string> = {
  28: 'Actie', 12: 'Avontuur', 16: 'Animatie', 35: 'Komedie', 80: 'Misdaad',
  99: 'Documentaire', 18: 'Drama', 10751: 'Familie', 14: 'Fantasy', 36: 'Historie',
  27: 'Horror', 10402: 'Muziek', 9648: 'Mysterie', 10749: 'Romantiek', 878: 'Sci-fi',
  10770: 'TV-film', 53: 'Thriller', 10752: 'Oorlog', 37: 'Western',
};
const GENRES_EN: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-fi',
  10770: 'TV movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
};
export const GENRES = uiLang === 'nl' ? GENRES_NL : GENRES_EN;

// Unreleased movies are hidden everywhere — you can't watch them yet.
export const today = () => new Date().toISOString().slice(0, 10);
export const isReleased = (r: any) => !r.release_date || r.release_date <= today();
