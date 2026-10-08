# MovieNight 🎬

A shared movie watchlist for two people, with live sync between phones. Built with
Expo / React Native, Supabase (database + realtime + anonymous auth) and TMDB
(movie data + streaming availability). The UI follows the device language
(English or Dutch); the app is called **MovieNight** in English and **Filmavond**
in Dutch.

## Features

- **Shared watchlist** — pair with a short code or by scanning a **QR code**; no accounts
- **Locked-down database** — membership-based row-level security on anonymous auth
- **Live sync** plus **in-app notifications**: a catch-up banner ("X added 2 movies")
  and live toasts when your partner adds or rates something
- **To watch / Seen tabs** with a **list ↔ poster-grid** toggle (remembered)
- **Search & browse** by streaming service (Netflix, Disney+, Prime Video, Max,
  Videoland, Viaplay, SkyShowtime, Apple TV+ — selectable in Settings), with
  filters (length incl. < 30 min, year range, genre dropdown, kid-friendly, hide seen /
  hide watchlist) and sorts (popular, rating, year, runtime)
- **For You** — themed recommendation rows built from your 7+ ratings and your list:
  best match tonight, nice and short, highest rated, on your services, for the kids,
  hidden gems; per-poster actions (add / already seen / not interested); a **"More"**
  tile opens any row as a grid with load-more
- **Just streaming in the US** — recent US digital releases with their Dutch status
  (on your service / for rent, e.g. Pathé Thuis / not in NL yet)
- **Taste match meter** — how well your ratings line up, the tougher critic, your shared
  favourite and your biggest debate
- **Movie details** — overview with read-more, **"Watch on …" deep-link buttons**
  as the primary action, trailer and TMDB as secondary links
- **Movie roulette** 🎲 — Material FAB, 10s countdown that accelerates into a
  slot-machine poster spin (with escalating haptics) and lands on the winner with confetti
- **Per-person ratings** (editable later without changing the watch date)
- **IMDb ratings** everywhere instead of TMDB's — from a bundled list of ~270k movies
  (instant, offline); only new or missing movies are looked up live (OMDb or Cinemeta)
  and remembered for a long time
- **Hype votes** 🔥 — hype movies on the watchlist; your partner's vote stays secret until
  you've both hyped it, then it gets a flame (and a filter)
- **Offline cache** — the list, movie details and recommendations open instantly, even
  without internet; TMDB requests are deduplicated and throttled
- Micro-animations + haptics throughout; cinema-red theme with a photo backdrop

See [CHANGELOG.md](CHANGELOG.md) for what changed per version and [TODO.md](TODO.md) for
open work and ideas.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `src/config.example.ts` to `src/config.ts` and fill in your own keys:
   - A **TMDB** API Read Access Token — https://www.themoviedb.org/settings/api
   - Your **Supabase** project URL and publishable key — https://supabase.com
   - Optional: a free **OMDb** key for live IMDb ratings of new movies (without it the
     app uses Stremio's free Cinemeta service)
3. In Supabase:
   - Enable **Anonymous sign-ins** (Authentication → Sign In / Providers)
   - Run `supabase/supabase_setup.sql`, then `supabase/supabase_v1_1_security.sql` in the SQL editor
   - Once every device runs v1.1+, run `supabase/supabase_v1_1_lockdown.sql` to remove the
     legacy open access
   - Run `supabase/supabase_v1_4_hype.sql` (hype votes) and `supabase/supabase_v1_4_1_ratings.sql`
     (safe ratings)
4. Start the dev server and open in Expo Go:
   ```bash
   npx expo start
   ```

## Release (APK + download page)

`scripts/release.sh` refreshes the IMDb ratings, builds the signed APK and publishes it
with a small download page on https://coenvermeer.nl/movienight/ (`--no-upload` builds
only, into `dist/site/`). Before a release: bump `version`/`versionCode` in `app.json` and
add an entry to `release-notes.md` (shown on the page) and `CHANGELOG.md`. Signing uses the
`MN_*` properties in `~/.gradle/gradle.properties` (see `plugins/withReleaseSigning.js`).

## Build an Android APK manually


First refresh the bundled IMDb ratings (downloads IMDb's daily dataset, ~20 s). The
generated `src/imdbData.ts` is git-ignored: IMDb's data is for personal use only.
`npm install` creates an empty placeholder, in which case all ratings are looked up live.

```bash
npm run imdb
npx expo prebuild --platform android   # first time only
cd android && ./gradlew assembleRelease
```
The APK lands in `android/app/build/outputs/apk/release/` (arm64-only by default,
see `android/gradle.properties`). Note: the generated `android/` folder carries a
release signing config pointing at a keystore kept outside the repo — keep signing
identical across builds so updates install over the previous version.

## Tech

Expo SDK 54 · React Native 0.81 · React Navigation · Supabase (realtime + anon auth) ·
TMDB · Reanimated / Gesture Handler / Draggable FlatList · expo-camera (QR) ·
expo-haptics · react-native-qrcode-svg · react-native-confetti-cannon
