import { supabase } from './supabase';

/** Indian mobile numbers; Supabase expects E.164 without spaces. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return null;
}

export async function sendOtp(phone: string) {
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) throw error;
}

export async function verifyOtp(phone: string, token: string) {
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
  if (error) throw error;
}

/** Re-issues the JWT so newly granted roles (e.g. rider after onboarding) appear in claims. */
export async function refreshClaims() {
  await supabase.auth.refreshSession();
}

export async function signOut() {
  await supabase.auth.signOut();
}
