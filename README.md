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
3. In Supabase:
   - Enable **Anonymous sign-ins** (Authentication → Sign In / Providers)
   - Run `supabase_setup.sql`, then `supabase_v1_1_security.sql` in the SQL editor
   - Once every device runs v1.1+, run `supabase_v1_1_lockdown.sql` to remove the
     legacy open access
4. Start the dev server and open in Expo Go:
   ```bash
   npx expo start
   ```

## Build an Android APK

```bash
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
