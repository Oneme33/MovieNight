import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from './config';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export type MovieRow = {
  id: string;
  list_id: string;
  tmdb_id: number | null;
  title: string;
  year: number | null;
  poster_path: string | null;
  genre: string | null;
  position: number;
  seen: boolean;
  seen_at: string | null;
  ratings: Record<string, number> | null; // member id → score (v1.5; older rows may still use names)
  hype?: Record<string, boolean> | null; // member id → hyped
  added_by: string | null; // display name at the time (fallback)
  added_by_member?: string | null; // member id (v1.5)
  created_at: string;
};

export type MemberRow = { id: string; name: string };

export type ListRow = {
  id: string;
  code: string;
  name: string | null;
  created_at: string;
};
