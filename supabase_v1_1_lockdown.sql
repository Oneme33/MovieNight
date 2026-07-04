-- MovieNight v1.1 — PART B: final lock-down.
-- Run this ONLY when everyone has installed the v1.1 app.
-- It removes the old open access, so from then on only members (via code/QR) can
-- read or change a list. (The v1.0 app will stop working after this.)

drop policy if exists "lists open" on public.lists;
drop policy if exists "movies open" on public.movies;

-- From here on, access is governed by the membership policies from Part A.
