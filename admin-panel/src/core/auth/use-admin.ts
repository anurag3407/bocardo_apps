'use client';

import { useEffect, useState } from 'react';
import type { AdminClaims } from './claims';
import { supabase } from './supabase-browser';

/** Current admin identity from the verified session claims. */
export function useAdmin() {
  const [claims, setClaims] = useState<AdminClaims | null>(null);
  useEffect(() => {
    const load = () => supabase.auth.getClaims().then(({ data }) => setClaims((data?.claims as AdminClaims) ?? null));
    void load();
    const { data } = supabase.auth.onAuthStateChange(() => void load());
    return () => data.subscription.unsubscribe();
  }, []);
  return { claims, role: claims?.admin_role ?? null };
}
