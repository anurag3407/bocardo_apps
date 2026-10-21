import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Normalises to digits-with-country-code and enforces the allowed countries. Restricting
 * destinations is the single most effective defence against SMS pumping, which relies on
 * sending to premium-rate international ranges.
 */
export function normalizeOtpPhone(
  input: string,
  allowedCountryCodes: string[],
): { ok: true; phone: string } | { ok: false; reason: string } {
  const digits = input.replace(/\D/g, '');
  const phone = digits.length === 10 ? `91${digits}` : digits;
  const country = allowedCountryCodes.find((cc) => phone.startsWith(cc));
  if (!country) return { ok: false, reason: 'COUNTRY_NOT_SUPPORTED' };
  // India: 10-digit mobile numbers start with 6-9
  if (country === '91' && !/^91[6-9]\d{9}$/.test(phone))
    return { ok: false, reason: 'INVALID_PHONE' };
  if (phone.length < 10 || phone.length > 15) return { ok: false, reason: 'INVALID_PHONE' };
  return { ok: true, phone };
}

/**
 * Standard Webhooks verification (used by Supabase Auth hooks):
 * signature = base64(HMAC-SHA256(secret, `${id}.${timestamp}.${body}`)), header "v1,<sig> v1,<sig2>".
 */
export function verifyStandardWebhook(
  secret: string,
  headers: { id?: string; timestamp?: string; signature?: string },
  rawBody: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > toleranceSeconds) return false;

  const key = Buffer.from(secret.replace(/^v1,/, '').replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest();
  return signature.split(' ').some((part) => {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) return false;
    const given = Buffer.from(sig, 'base64');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
