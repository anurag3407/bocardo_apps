import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { env } from '../config/env';
import { kv } from '../storage/kv';

/** Supabase is used for auth and realtime only — all data goes through the Bocardo API. */
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: { storage: kv, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

// Refresh tokens only while the app is in the foreground (Supabase React Native guidance).
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
