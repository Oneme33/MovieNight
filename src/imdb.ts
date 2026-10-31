import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { IMDB_DATA, IMDB_BUILT } from './imdbData';
import * as config from './config';

// IMDb ratings: the bundled list (scripts/imdb-ratings.mjs) answers instantly and offline.
// When the app is online, a newer list is downloaded from coenvermeer.nl/movienight-data
// (scripts/server/movienight-imdb.py runs daily) and cached on the device, so ratings stay
// current without shipping a new APK. Only movies missing from the list, or recent ones
// whose rating still moves, are looked up live — via OMDb when an OMDB_KEY is configured,
// otherwise Stremio's free Cinemeta service — and those answers are remembered too.

const REC = 10; // 8-digit id + 2-digit rating
const OMDB_KEY: string | undefined = (config as any).OMDB_KEY || undefined;

const REMOTE_BASE = 'https://coenvermeer.nl/movienight-data';
const REMOTE_STORE = 'filmavond.imdb.remote.v1';
const REMOTE_FILE = 'imdb-ratings.txt';
const MIN_REMOTE_COUNT = 100_000; // same sanity check as the server script

type RemoteMeta = { built: string; count: number };
const remoteFile = () => new File(Paths.document, REMOTE_FILE);

let ratingData = IMDB_DATA; // bundled until a newer cached/downloaded list is available

// Binary search in the sorted fixed-width string: no parsing, no extra memory.
function bundled(imdbId: string): number | null {
  const n = Number(imdbId.slice(2));
  if (!n) return null;
  let lo = 0;
  let hi = ratingData.length / REC - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const id = Number(ratingData.substr(mid * REC, 8));
    if (id === n) return Number(ratingData.substr(mid * REC + 8, 2)) / 10;
    if (id < n) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}

async function readRemoteMeta(): Promise<RemoteMeta | null> {
  try {
    const raw = await AsyncStorage.getItem(REMOTE_STORE);
    if (!raw) return null;
    const meta = JSON.parse(raw) as RemoteMeta;
    return typeof meta?.built === 'string' && Number.isFinite(meta?.count) ? meta : null;
  } catch {
    return null;
  }
}

// The previous download, if it is still complete, answers before any network call.
async function loadCachedRemote() {
  if (Platform.OS === 'web') return;
  const meta = await readRemoteMeta();
  if (!meta || meta.built < IMDB_BUILT) return; // a newer APK's bundled list wins
  try {
    const file = remoteFile();
    if (!file.exists || file.size !== meta.count * REC) return;
    ratingData = await file.text();
  } catch {}
}

// Once per app start: ask for the small metadata file, and only download the list when the
// server has a newer build than the app's bundled or cached copy.
async function refreshRemote() {
  if (Platform.OS === 'web') return;
  try {
    const res = await fetch(`${REMOTE_BASE}/imdb-ratings.json`, { headers: { 'cache-control': 'no-cache' } });
    if (!res.ok) return;
    const meta = (await res.json()) as RemoteMeta;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(meta?.built ?? '') || !(meta?.count >= MIN_REMOTE_COUNT)) return;
    if (meta.built <= IMDB_BUILT) return; // bundled list is at least as new
    const cached = await readRemoteMeta();
    const file = remoteFile();
    if (cached?.built === meta.built && file.exists && file.size === meta.count * REC) return;
    const downloaded = await File.downloadFileAsync(`${REMOTE_BASE}/${REMOTE_FILE}`, file, { idempotent: true });
    if (downloaded.size !== meta.count * REC) return; // partial/corrupt: keep what we had
    ratingData = await downloaded.text();
    await AsyncStorage.setItem(REMOTE_STORE, JSON.stringify({ built: meta.built, count: meta.count }));
  } catch {}
}

// Live answers, persisted. `r` null = IMDb had no rating yet (also worth remembering).
type Live = { r: number | null; at: number };
const STORE = 'filmavond.imdb.v1';
const DAY = 864e5;
const live = new Map<string, Live>();
let hydrated: Promise<void> | null = null;
const hydrate = () => (hydrated ??= (async () => {
  await loadCachedRemote();
  try {
    const raw = await AsyncStorage.getItem(STORE);
    if (raw) for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, Live>)) live.set(k, v);
  } catch {}
  refreshRemote(); // background: updates ratingData for later lookups
})());

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const entries = [...live.entries()].sort((a, b) => b[1].at - a[1].at).slice(0, 3000);
    AsyncStorage.setItem(STORE, JSON.stringify(Object.fromEntries(entries))).catch(() => {});
  }, 2000);
}

// New releases gain votes fast, so their rating is refreshed now and then; older ratings
// barely move, so the bundled value (or a live answer) is kept for half a year.
function maxAge(releaseDate: string | null): number {
  const age = releaseDate ? Date.now() - Date.parse(releaseDate) : Infinity;
  if (age < 60 * DAY) return 3 * DAY;
  if (age < 365 * DAY) return 14 * DAY;
  return 180 * DAY;
}
const isRecent = (releaseDate: string | null) => maxAge(releaseDate) < 180 * DAY;

async function fetchJson(url: string): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000); // never hold up the movie details
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLive(imdbId: string): Promise<number | null> {
  if (OMDB_KEY) {
    const d = await fetchJson(`https://www.omdbapi.com/?i=${imdbId}&apikey=${OMDB_KEY}`);
    if (d.Response === 'False') {
      if (/limit/i.test(d.Error ?? '')) throw new Error(d.Error); // over quota: retry later
      return null;
    }
    const r = parseFloat(d.imdbRating);
    return isNaN(r) ? null : r;
  }
  const d = await fetchJson(`https://v3-cinemeta.strem.io/meta/movie/${imdbId}.json`);
  const r = parseFloat(d?.meta?.imdbRating);
  return isNaN(r) ? null : r;
}

const inFlight = new Map<string, Promise<number | null>>();

// The IMDb rating for a movie, or null when IMDb has none (callers fall back to TMDB).
export async function imdbRating(imdbId: string | null | undefined, releaseDate: string | null): Promise<number | null> {
  if (!imdbId) return null;
  await hydrate();
  const cached = live.get(imdbId);
  if (cached && Date.now() - cached.at < maxAge(releaseDate)) return cached.r;
  const fromBundle = bundled(imdbId);
  if (fromBundle != null && !isRecent(releaseDate)) return fromBundle;

  let p = inFlight.get(imdbId);
  if (!p) {
    p = fetchLive(imdbId).then((r) => {
      live.set(imdbId, { r, at: Date.now() });
      scheduleSave();
      return r;
    }).catch(() => cached?.r ?? fromBundle) // offline / quota: best value we have
      .finally(() => inFlight.delete(imdbId));
    inFlight.set(imdbId, p);
  }
  return p;
}
