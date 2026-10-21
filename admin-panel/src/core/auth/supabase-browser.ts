import { createBrowserClient } from '@supabase/ssr';
import { env } from '../config/env';

/** Cookie-backed session shared with the proxy (so protected routes are checked server-side too). */
export const supabase = createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
