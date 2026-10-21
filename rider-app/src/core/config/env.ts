/**
 * Build-time config. EXPO_PUBLIC_* vars must be referenced literally so Metro can inline them.
 */
export const env = {
  app: 'rider' as const,
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000',
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  mapboxToken: process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '',
};
