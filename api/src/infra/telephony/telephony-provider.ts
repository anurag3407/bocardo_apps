export type ConnectResult =
  /** The platform rings the caller, then bridges to the callee; both see only the platform number. */
  | { mode: 'callback'; providerRef: string }
  /** Development only: the app dials the number itself. */
  | { mode: 'direct'; dial: string; providerRef: null };

export interface TelephonyProvider {
  readonly name: 'exotel' | 'twilio' | 'direct';
  connect(input: {
    fromPhone: string;
    toPhone: string;
    timeLimitSeconds: number;
    statusCallbackUrl: string;
  }): Promise<ConnectResult>;
  /** Normalises a provider status callback to our vocabulary. */
  parseStatus(
    body: Record<string, string>,
  ): { providerRef: string; status: string; durationSeconds: number | null } | null;
}

export const TELEPHONY_PROVIDER = Symbol('TELEPHONY_PROVIDER');

/** Profiles store phones as digits ("919876543210"); providers want E.164. */
export const toE164 = (phone: string) => `+${phone.replace(/\D/g, '')}`;
