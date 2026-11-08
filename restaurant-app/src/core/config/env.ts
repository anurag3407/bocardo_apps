/**
 * Build-time config. EXPO_PUBLIC_* vars must be referenced literally so Metro can inline them.
 */
export const env = {
  app: 'restaurant' as const,
  apiUrl: process.env.EXPO_PUBLIC_API_URL || 'https://api.bocardo.in',
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://xjqexaikumyjchtiqcln.supabase.co',
  supabaseAnonKey:
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    'sb_publishable_Ulr3_St0cYbBrMFWWmh-SA_-izndqFb',
  mapboxToken: process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '',
};
