import { getAuth, signInWithPhoneNumber, signOut as firebaseSignOut } from '@react-native-firebase/auth';
import { httpClient } from '../api/http-client';
import { unregisterPush } from '../notifications/push';
import { supabase } from './supabase';

type ConfirmationResult = Awaited<ReturnType<typeof signInWithPhoneNumber>>;

let pendingConfirmation: {
  phone: string;
  confirmation: ConfirmationResult;
} | null = null;

/** Indian mobile numbers; Firebase & Supabase expect E.164 without spaces. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return null;
}

function friendlyAuthError(err: unknown): Error {
  const code = (err as { code?: string } | null)?.code;
  switch (code) {
    case 'auth/invalid-verification-code':
      return new Error('Invalid code. Please check the 6-digit OTP and try again.');
    case 'auth/session-expired':
    case 'auth/code-expired':
      return new Error('This OTP has expired. Please tap Resend code.');
    case 'auth/too-many-requests':
      return new Error('Too many attempts. Please wait a few minutes and try again.');
    case 'auth/invalid-phone-number':
      return new Error('Enter a valid 10-digit mobile number.');
    case 'auth/network-request-failed':
      return new Error('Network error. Check your internet connection and try again.');
    default:
      return err instanceof Error ? err : new Error('Authentication failed. Please try again.');
  }
}

/** Sends an SMS OTP via Firebase Phone Auth (Play Integrity / App Attest protected). */
export async function sendOtp(phone: string) {
  const auth = getAuth();
  pendingConfirmation = null;
  if (auth.currentUser) {
    await firebaseSignOut(auth).catch(() => undefined);
  }
  try {
    const confirmation = await signInWithPhoneNumber(auth, phone);
    pendingConfirmation = { phone, confirmation };
  } catch (err) {
    throw friendlyAuthError(err);
  }
}

async function confirmPhoneUser(phone: string, token: string) {
  const auth = getAuth();
  if (auth.currentUser && auth.currentUser.phoneNumber === phone) {
    return auth.currentUser;
  }
  if (!pendingConfirmation || pendingConfirmation.phone !== phone) {
    throw new Error('Verification session expired. Please request a new code.');
  }
  try {
    const credential = await pendingConfirmation.confirmation.confirm(token);
    if (!credential?.user) throw new Error('Verification failed. Please try again.');
    return credential.user;
  } catch (err) {
    throw friendlyAuthError(err);
  }
}

/**
 * Confirms the Firebase Phone OTP, then exchanges the Firebase ID token for a genuine
 * Supabase Auth session via the Bocardo API so RLS, Realtime, and Storage work unchanged.
 */
export async function verifyOtp(phone: string, token: string) {
  const user = await confirmPhoneUser(phone, token);
  const idToken = await user.getIdToken(true);
  const session = await httpClient<{ accessToken: string; refreshToken: string }>(
    '/auth/firebase-phone',
    {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    },
  );
  const { error } = await supabase.auth.setSession({
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
  });
  if (error) throw error;

  pendingConfirmation = null;
  await firebaseSignOut(getAuth()).catch(() => undefined);
}

/** Re-issues the JWT so newly granted roles (e.g. rider after onboarding) appear in claims. */
export async function refreshClaims() {
  await supabase.auth.refreshSession();
}

export async function signOut() {
  pendingConfirmation = null;
  await unregisterPush();
  await Promise.allSettled([supabase.auth.signOut(), firebaseSignOut(getAuth())]);
}
