import type { ConnectResult, TelephonyProvider } from './telephony-provider';
import { toE164 } from './telephony-provider';

/** Local development fallback — returns the number to dial. Forbidden in production by env validation. */
export class DirectTelephonyProvider implements TelephonyProvider {
  readonly name = 'direct' as const;

  async connect(input: { toPhone: string }): Promise<ConnectResult> {
    return { mode: 'direct', dial: toE164(input.toPhone), providerRef: null };
  }

  parseStatus() {
    return null;
  }
}
