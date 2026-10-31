// Copy this file to `src/config.ts` and fill in your own keys.
// config.ts is git-ignored so your keys stay out of the repository.

export const TMDB_TOKEN = 'YOUR_TMDB_READ_ACCESS_TOKEN';

export const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
export const SUPABASE_KEY = 'YOUR_SUPABASE_PUBLISHABLE_KEY';

// Default UI language: 'auto' follows the device. The app can switch it in Settings;
// this only sets the initial value.
export const UI_LANG: 'auto' | 'nl' | 'en' = 'auto';

// Optional: free OMDb key (https://www.omdbapi.com/apikey.aspx, 1,000 requests/day) for
// live IMDb ratings of new movies. Without it the app uses Stremio's free Cinemeta service.
export const OMDB_KEY = '';

// Optional: Sentry DSN (sentry.io → project → Settings → Client Keys) for crash reports.
// Leave empty to turn crash reporting off.
export const SENTRY_DSN = '';
