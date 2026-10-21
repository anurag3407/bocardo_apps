import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { supabase } from './supabase';

export type AppRole = 'customer' | 'restaurant' | 'rider' | 'admin';

interface SessionState {
  status: 'loading' | 'signedOut' | 'signedIn';
  session: Session | null;
  roles: AppRole[];
}

export const useSession = create<SessionState>(() => ({ status: 'loading', session: null, roles: [] }));

/** Roles are put into the access token by the Supabase custom access token hook. */
export function rolesFromToken(token: string | undefined): AppRole[] {
  if (!token) return [];
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return Array.isArray(payload.app_roles) ? payload.app_roles : ['customer'];
  } catch {
    return [];
  }
}

function apply(session: Session | null) {
  useSession.setState({ session, status: session ? 'signedIn' : 'signedOut', roles: rolesFromToken(session?.access_token) });
}

let started = false;

export function startSessionSync() {
  if (started) return;
  started = true;
  supabase.auth.getSession().then(({ data }) => apply(data.session));
  supabase.auth.onAuthStateChange((_event, session) => apply(session));
}

export async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
