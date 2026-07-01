# MovieNight 🎬

A shared movie watchlist for two people, with live sync between phones. Built with
Expo / React Native, Supabase (database + realtime) and TMDB (movie data + streaming
availability). The UI follows the device language (English or Dutch); the app is
called **MovieNight** in English and **Filmavond** in Dutch.

## Features

- **Shared watchlist** with a pairing code — no accounts needed
- **Live sync** between devices (Supabase realtime)
- **Search** movies with posters and ratings (TMDB)
- **Browse by streaming service** (Netflix, Videoland, Disney+, Prime Video, Max) with
  NL availability, sort by popularity / rating / year, and load more
- **Mark as seen** with a personal rating; a collapsible "Seen" section
- **Sort** the watchlist (newest, rating, title, streaming service, or manual drag)
- Swipe to mark seen or delete
- Cinema-red theme with a subtle backdrop

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `src/config.example.ts` to `src/config.ts` and fill in your own keys:
   - A **TMDB** API Read Access Token — https://www.themoviedb.org/settings/api
   - Your **Supabase** project URL and publishable key — https://supabase.com
3. In the Supabase SQL editor, run `supabase_setup.sql` to create the tables.
4. Start the dev server and open in Expo Go:
   ```bash
   npx expo start
   ```

## Build an Android APK

```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
```
The APK lands in `android/app/build/outputs/apk/release/`.

## Tech

Expo SDK 54 · React Native 0.81 · React Navigation · Supabase · TMDB ·
react-native-reanimated / gesture-handler / draggable-flatlist
