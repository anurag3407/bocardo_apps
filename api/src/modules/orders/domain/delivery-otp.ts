import { createHmac } from 'node:crypto';
import { hashOtp } from '../../../common/utils/codes';

/**
 * Deterministic per-order OTP: HMAC(secret, orderId) → 4 digits. Nothing secret is
 * stored; the customer is shown it and the rider must enter it at hand-off.
 */
export function deliveryOtp(secret: string, orderId: string): string {
  const digest = createHmac('sha256', secret).update(`delivery-otp:${orderId}`).digest();
  return String(digest.readUInt32BE(0) % 10_000).padStart(4, '0');
}

export function deliveryOtpHash(secret: string, orderId: string): string {
  return hashOtp(orderId, deliveryOtp(secret, orderId));
}

export function verifyDeliveryOtp(storedHash: string, orderId: string, candidate: string): boolean {
  return /^\d{4}$/.test(candidate) && hashOtp(orderId, candidate) === storedHash;
}
