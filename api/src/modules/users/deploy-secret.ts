import { timingSafeEqual } from 'node:crypto';

/** Constant-time header secret check for VPS CI -> API internal release calls. */
export function verifyDeploySecret(given: string | undefined, expected: string): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
