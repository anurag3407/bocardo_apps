import { z } from 'zod';

export const Uuid = z.uuid();
export const IsoDate = z.string().describe('ISO-8601 timestamp');
export const Paise = z.number().int().describe('Amount in paise (₹1 = 100)');

export const LatLngQuery = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export const CursorQuery = z.object({
  cursor: z.string().optional().describe('Opaque cursor from the previous page'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
export const isoRequired = (d: Date): string => d.toISOString();

export const OkSchema = z.object({ ok: z.literal(true) });
export const OK = { ok: true as const };
