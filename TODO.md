# To do

Open work and parked ideas, roughly in priority order. Done items move to
[CHANGELOG.md](CHANGELOG.md).

## Next up
- [ ] **Run `supabase/supabase_v1_1_lockdown.sql`** once both phones run v1.1+ (removes the legacy
      open access). Checked 2026-10-08: not done yet — `lists open` / `movies open` still exist.
- [ ] **Real push notifications** (also when the app is closed) when your partner adds or
      rates a movie — needs Expo push tokens + a Supabase trigger / edge function.
- [ ] **Undo after delete** — a short "Undo" toast instead of deleting immediately.
- [ ] **Remember the chosen sort** on the watchlist (like the list/grid view already is).
- [ ] **Search beyond 20 results** — load-more for text searches (browse already has it).

## Nice to have
- [ ] Share "not interested" between partners (now stored per device).
- [ ] TV series support (seasons/episodes) — parked for now.
- [ ] Automated tests for the pure logic (taste match, filters, scoring).
- [ ] Google Play release (needs a developer account, privacy policy, store listing).

## Fun ideas
- [ ] **Match mode** — both swipe through suggestions; a movie you both like is a match.
- [ ] **Veto roulette** — each of you may veto one roulette result.
- [ ] **Movie night planner** — pick a date, get a reminder and a shortlist.
- [ ] **Blind date movie** — only genre + runtime shown until you commit.
- [ ] **Year in review** — your top 10, most-watched genre, taste match over time.
- [ ] **Challenges** — e.g. "one movie from every decade".

## Known limitations
- TMDB's server-side runtime filter is unreliable; the app filters client-side on the
  real runtime (and tops up pages automatically).
- Streaming availability comes from TMDB/JustWatch and can lag a few days behind.
