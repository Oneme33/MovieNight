# Changelog

All notable changes to MovieNight / Filmavond.

## 1.5.1 — 2026-10-21 (versionCode 8)

### New
- **Crash reporting is on** (Sentry project `coenvermeernl/movienight`, EU region). Source maps
  are uploaded at build time when a Sentry auth token is in `~/.sentryclirc`.
- Long-press the version in Settings to send a test report.
- Source maps for 1.5.1 uploaded afterwards (release `filmavond@1.5.1+8`): its reports show our
  source files. From the next build on, `metro.config.js` adds Sentry Debug IDs and the build
  uploads the maps itself (token in `~/.sentryclirc`), so every report is readable right away.

## 1.5.0 — 2026-10-21 (versionCode 7)

### Changed
- **Identity by member id instead of display name.** Ratings, hype votes and "added by" are
  keyed by `list_members.id` (`supabase/supabase_v1_5_members.sql` converts existing data and
  keeps a backup table). Renaming yourself no longer orphans your ratings; names come from the
  member list. Rejoining with your name (reinstall, new phone) takes over your member again.
  Older apps keep working: their name-based calls are mapped to member ids on the server.
- **Code split into small modules** (max ~300 lines per file): `src/watchlist/`, `src/search/`,
  `src/foryou/`, `src/tmdb/`, `src/i18n/`. No behaviour change.

### New
- **App version per member** (`list_members.app_version` / `last_seen_at`), version shown in
  Settings, and a **"new version available"** banner when coenvermeer.nl/movienight has a newer
  APK (`version.json` on the download page).
- **Crash reporting with Sentry**, active once `SENTRY_DSN` is set in `src/config.ts`.
- Onboarding hint: one of you creates the list, the other joins with the code.

## 1.4.1 — 2026-10-08 (versionCode 6)

### Fixed
- **A partner's rating could be overwritten** when you both rated a movie at about the same
  time: the app wrote the whole ratings object back. Ratings now go through `set_rating()`
  on the server, which changes only your own score (`supabase/supabase_v1_4_1_ratings.sql`).
- **Failed saves were lost silently** (offline, server error): supabase-js returns errors
  instead of throwing, so the rollbacks never ran. Every write now checks for errors; the
  watchlist undoes the change, shows "Couldn't save" and resyncs.
- **Switching the title language back and forth** (en → nl → en) left the list without
  ratings, runtimes and services until a restart.

## 1.4.0 — 2026-10-08 (versionCode 5)

### Security
- Lock-down done on the live database (2026-10-08): the legacy open policies `lists open`
  and `movies open` are gone, so only list members can read or change a list.

### New
- **IMDb ratings** instead of TMDB's, everywhere (lists, posters, details — labelled
  "IMDb" in the details sheet). A bundled list of ~270k movies (`npm run imdb`) answers
  instantly; movies missing from it, or still new, are looked up live (OMDb with a key,
  otherwise Cinemeta) and cached for 3 days (new releases) up to half a year. Falls back
  to TMDB when IMDb has no rating.
- **Hype votes** 🔥 on the watchlist: tap the flame on a movie. Your partner's vote stays
  hidden until you've both hyped it — then it gets a flame, a toast for both of you, and
  a "only movies you both hyped" filter. Needs `supabase/supabase_v1_4_hype.sql`.
- **Multiple genres** in the search and watchlist filters, with "any of these" /
  "all of these".

## 1.3.0 — 2026-09-26 (versionCode 4)

### Fixed
- **Crash / spontaneous exit on first launch** — the watchlist re-requested movie details
  for every not-yet-loaded movie on each incoming result (hundreds of parallel TMDB calls,
  running out of memory). Details are now requested once per movie, deduplicated while in
  flight, throttled to 6 concurrent requests and applied in batches. Same fix for Search
  and For You.
- **Choppy scrolling in the filter sheets** — the tap-outside layer no longer wraps the
  scroll view; header and Apply button stay fixed while the middle scrolls.

### Faster
- Movie details (rating, services, runtime, genres, NL rent stores) are cached on the
  device for 3 days, so a cold start shows complete cards immediately.
- The app opens straight into your list; list membership is confirmed in the background.

### New
- **Taste match meter** on the Seen tab — match % from ratings you both gave, with an
  animated gauge, the tougher critic, your shared favourite, your biggest debate and the
  genre you agree on most (unlocks after 3 shared ratings).
- **"Just streaming in the US"** row on For You — recent US digital releases, each with its
  Dutch status: already on your service / for rent (e.g. Pathé Thuis) / not in NL yet.
- **"More" tile at the end of every For You row** — opens the whole row as a poster grid
  with load-more (digs deeper into recommendation pages / US releases).
- **Search filters**: year range (from–to + presets: last 3 years, decades, before 1980),
  genre as a dropdown, **< 30 min** length option, and "hide seen" + "hide watchlist"
  switches (both on by default).
- Genre dropdown and < 30 min option in the watchlist filters as well.
- **Roulette haptics** — escalating vibration from 5 to 1 before the reveal.
- **Skeleton loaders** (pulsing placeholder cards/posters) and a larger start-up loader.

### Changed
- Length filters only show a movie once its real runtime is known (TMDB's server-side
  runtime filter is unreliable) and top up with extra pages automatically.
- Year-filtered browsing requires ≥ 50 votes, keeping obscure titles off the top.
- TMDB attribution translated to Dutch.

## 1.2.0 — 2026-07-05 (versionCode 3)
- Themed rows on For You (tonight, on your services, short, top rated, kids, hidden gems)
  with add / already seen / not interested actions.
- Roulette 2.0: 10 s countdown, accelerating poster spin, confetti; Material FAB.
- List ↔ poster-grid toggle; edit your rating later (watch date kept).
- "Watch on …" deep-link buttons in movie details; trailer and TMDB as links.
- Offline cache for the list and recommendations.
- In-app notifications: catch-up banner and live toasts for partner activity.
- Micro-animations and haptics; arm64-only APK (~40 MB).

## 1.1.0 — 2026-07-04 (versionCode 2)
- Security: anonymous auth + row-level security via list membership.
- QR-code pairing; To watch / Seen tabs; filters (length, genre, kid-friendly).
- Selectable streaming services; For You recommendations; movie details + trailer;
  movie roulette; unreleased movies hidden.

## 1.0.0 — 2026-07-01
- Shared watchlist with live sync, TMDB search, Dutch streaming availability, seen +
  per-person ratings, sorting, cinema theme, installable APK.
