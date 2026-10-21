import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class EarningsQueryDto extends createZodDto(
  z.object({
    from: z.iso.date().describe('YYYY-MM-DD, inclusive'),
    to: z.iso.date().describe('YYYY-MM-DD, inclusive'),
  }),
) {}

export class EarningsDto extends createZodDto(
  z.object({
    totalPaise: z.number().int(),
    orders: z.number().int(),
    unpaidBalancePaise: z.number().int(),
    days: z.array(
      z.object({ day: z.string(), amountPaise: z.number().int(), orders: z.number().int() }),
    ),
  }),
) {}

/** Inclusive date range in IST → [from, to) instants. */
export function istRange(from: string, to: string): [Date, Date] {
  const start = new Date(`${from}T00:00:00+05:30`);
  const end = new Date(`${to}T00:00:00+05:30`);
  end.setUTCDate(end.getUTCDate() + 1);
  return [start, end];
}
