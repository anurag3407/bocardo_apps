import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class RateOrderDto extends createZodDto(
  z.object({
    restaurantRating: z.number().int().min(1).max(5),
    riderRating: z.number().int().min(1).max(5).optional(),
    comment: z.string().trim().max(500).optional(),
  }),
) {}

export const TICKET_CATEGORIES = [
  'missing_item',
  'wrong_item',
  'quality',
  'late_delivery',
  'payment',
  'rider_behaviour',
  'restaurant_issue',
  'account',
  'other',
] as const;

export class CreateTicketDto extends createZodDto(
  z.object({
    app: z.enum(['customer', 'restaurant', 'rider']),
    orderId: z.uuid().optional(),
    category: z.enum(TICKET_CATEGORIES),
    subject: z.string().trim().min(3).max(120),
    description: z.string().trim().min(10).max(2000),
    attachments: z
      .array(z.string().max(500))
      .max(5)
      .default([])
      .describe('Storage object paths in support-attachments/'),
  }),
) {}

export const TicketSchema = z
  .object({
    id: z.string(),
    orderId: z.string().nullable(),
    app: z.enum(['customer', 'restaurant', 'rider', 'admin']),
    category: z.string(),
    subject: z.string(),
    description: z.string(),
    attachments: z.array(z.string()),
    status: z.enum(['open', 'in_progress', 'resolved', 'closed']),
    resolution: z.string().nullable(),
    refundPaise: z.number().int().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: 'SupportTicket' });

export class TicketDto extends createZodDto(TicketSchema.clone()) {}
export class TicketListDto extends createZodDto(z.array(TicketSchema)) {}
