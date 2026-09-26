# Changelog

All notable changes to MovieNight / Filmavond.

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

## 1.1.0 (versionCode 2)
- Security: anonymous auth + row-level security via list membership.
- QR-code pairing; To watch / Seen tabs; filters (length, genre, kid-friendly).
- Selectable streaming services; For You recommendations; movie details + trailer;
  movie roulette; unreleased movies hidden.

## 1.0.0
- Shared watchlist with live sync, TMDB search, Dutch streaming availability, seen +
  per-person ratings, sorting, cinema theme, installable APK.
