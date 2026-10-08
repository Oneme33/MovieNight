# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.
(The project itself is still on SDK 54 — check `package.json`; an upgrade is on the TODO.)

# Conventions

- **Max ~300 lines per file.** Split components, hooks and helpers before a file grows past
  that; don't add features to a file that is already over it without splitting first.
- All UI text goes through `src/i18n.ts` (Dutch + English).
- Database changes: a new `supabase/supabase_v<version>_<name>.sql` (safe to re-run), listed
  in the README setup steps.
- Every release: bump `version` + `versionCode` in `app.json`, add entries to `CHANGELOG.md`
  and `release-notes.md`, then `scripts/release.sh`.
