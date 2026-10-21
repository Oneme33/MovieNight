# To do

Open work and parked ideas, roughly in priority order. Done items move to
[CHANGELOG.md](CHANGELOG.md).

## Next up
- [ ] **Sentry: fill in `SENTRY_DSN`** in `src/config.ts` (crash reporting is built in since
      1.5 but off without a DSN), and set `SENTRY_AUTH_TOKEN` (+ org/project in the Sentry Expo
      plugin) for readable stack traces. Then find the Samsung "closes after a while" crash
      (seen 2026-10-17 on 1.4.1); suspects: memory (many full-size posters), realtime/resume path.
- [ ] **Release signing for more users** — the app is signed with React Native's public debug
      key, so anyone could sign an "update" Android accepts. Before sharing beyond the two of
      us: own release key (or Play App Signing). Existing installs need one reinstall + re-pair.
- [ ] **Upgrade Expo SDK** (now 54; AGENTS.md already points at v57) — follow the upgrade
      guide per SDK step and re-test the build.
- [ ] **Smarter realtime updates** — every change refetches the whole list; one drag sends a
      burst of updates, so both phones refetch ~10× and show in-between orders. Apply the
      changed row from the payload, debounce refetches, and save a new order in one RPC.
- [ ] **Real push notifications** (also when the app is closed) when your partner adds,
      rates or hypes a movie — needs Expo push tokens + a Supabase trigger / edge function.

## Small fixes and QoL
- [ ] **Quick unit tests** for the pure logic (taste match, genre/length filters, rec
      scoring, IMDb lookup).
- [ ] Undo after delete — a short "Undo" toast instead of deleting immediately.
- [ ] Remember the chosen sort on the watchlist (like the list/grid view already is).
- [ ] Search beyond 20 results — load-more for text searches (browse already has it).
- [ ] Drag-to-reorder snaps back until a refetch, and with a filter on the hidden movies'
      positions clash (`onDragEnd` / `persistOrder`).
- [ ] Search race: a slow reply for "star" can land after "star wars"; the clear (X) button
      doesn't cancel the pending search.
- [ ] Fetch timeouts for TMDB calls (a hung request blocks a throttle slot) + an error/retry
      state in the details sheet and on empty screens when offline.
- [ ] Unique index on `(list_id, tmdb_id)` so adding the same movie at the same moment
      can't create a duplicate.
- [ ] Accessibility labels on icon-only buttons.
- [ ] Cached movie details keep genre names in the language they were loaded in, so after
      switching the phone language genres stay in the old language for up to 3 days. Cache
      genre ids only and translate when rendering.

## Nice to have
- [ ] TV series support (seasons/episodes) — parked for now.
- [ ] Google Play release (needs a developer account, privacy policy, store listing).

## Fun ideas
- [ ] **Match mode** — both swipe through suggestions; a movie you both like is a match
      (builds on hype votes).
- [ ] **Year in review** — your top 10, most-watched genre, taste match over time.

## Known limitations
- TMDB's server-side runtime filter is unreliable; the app filters client-side on the
  real runtime (and tops up pages automatically).
- Streaming availability comes from TMDB/JustWatch and can lag a few days behind.
- Sorting by rating while browsing uses TMDB's score (server-side); cards show IMDb.
