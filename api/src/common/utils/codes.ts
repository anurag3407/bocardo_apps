import { createHash, randomInt } from 'node:crypto';

// No 0/O/1/I to keep codes readable over the phone.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Human-friendly order reference, e.g. "BC7K2Q9M". */
export function generateShortCode(length = 8): string {
  let code = 'BC';
  for (let i = 0; i < length - 2; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/** 4-digit delivery OTP shown to the customer and verified at hand-off. */
export function generateOtp(): string {
  return String(randomInt(0, 10_000)).padStart(4, '0');
}

export function hashOtp(orderId: string, otp: string): string {
  return createHash('sha256').update(`${orderId}:${otp}`).digest('hex');
}
