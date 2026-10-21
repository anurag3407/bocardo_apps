import { Inject, Injectable } from '@nestjs/common';
import type { Selectable } from 'kysely';
import { sql } from 'kysely';
import { AppError } from '../../common/errors/app-error';
import { DB, type Db } from '../../infra/database/database';
import type { SupportTicketsTable } from '../../infra/database/db.types';
import type { CreateTicketDto, RateOrderDto, TicketDto } from './feedback.dto';

@Injectable()
export class FeedbackService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** One rating per delivered order; restaurant/rider averages are updated incrementally. */
  async rate(userId: string, orderId: string, input: RateOrderDto) {
    await this.db.transaction().execute(async (tx) => {
      const order = await tx
        .selectFrom('orders')
        .select(['customer_id', 'status', 'restaurant_id', 'rider_id'])
        .where('id', '=', orderId)
        .executeTakeFirst();
      if (!order || order.customer_id !== userId) throw AppError.notFound('Order');
      if (order.status !== 'DELIVERED')
        throw AppError.conflict('NOT_DELIVERED', 'You can rate an order once it is delivered');

      const inserted = await tx
        .insertInto('ratings')
        .values({
          order_id: orderId,
          customer_id: userId,
          restaurant_id: order.restaurant_id,
          rider_id: order.rider_id,
          restaurant_rating: input.restaurantRating,
          rider_rating: order.rider_id ? (input.riderRating ?? null) : null,
          comment: input.comment ?? null,
        })
        .onConflict((oc) => oc.column('order_id').doNothing())
        .returning('id')
        .executeTakeFirst();
      if (!inserted) throw AppError.conflict('ALREADY_RATED', 'You have already rated this order');

      await tx
        .updateTable('restaurants')
        .set({
          rating_avg: sql`(rating_avg * rating_count + ${input.restaurantRating}) / (rating_count + 1)`,
          rating_count: sql`rating_count + 1`,
        })
        .where('id', '=', order.restaurant_id)
        .execute();
      if (order.rider_id && input.riderRating) {
        await tx
          .updateTable('riders')
          .set({
            rating_avg: sql`(rating_avg * rating_count + ${input.riderRating}) / (rating_count + 1)`,
            rating_count: sql`rating_count + 1`,
          })
          .where('id', '=', order.rider_id)
          .execute();
      }
    });
  }

  async createTicket(userId: string, input: CreateTicketDto): Promise<TicketDto> {
    if (input.orderId) {
      const order = await this.db
        .selectFrom('orders')
        .select(['customer_id', 'rider_id', 'restaurant_id'])
        .where('id', '=', input.orderId)
        .executeTakeFirst();
      const member = order
        ? await this.db
            .selectFrom('restaurant_members')
            .select('user_id')
            .where('restaurant_id', '=', order.restaurant_id)
            .where('user_id', '=', userId)
            .executeTakeFirst()
        : undefined;
      if (!order || (order.customer_id !== userId && order.rider_id !== userId && !member))
        throw AppError.notFound('Order');
    }
    // attachments must live in the caller's own storage folder
    if (input.attachments.some((path) => !path.startsWith(`${userId}/`))) {
      throw AppError.badRequest(
        'INVALID_ATTACHMENT',
        'Attachments must be uploaded to your own folder',
      );
    }
    const row = await this.db
      .insertInto('support_tickets')
      .values({
        user_id: userId,
        order_id: input.orderId ?? null,
        app: input.app,
        category: input.category,
        subject: input.subject,
        description: input.description,
        attachments: input.attachments,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toTicket(row);
  }

  async myTickets(userId: string) {
    const rows = await this.db
      .selectFrom('support_tickets')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('created_at', 'desc')
      .limit(50)
      .execute();
    return rows.map(toTicket);
  }
}

export function toTicket(t: Selectable<SupportTicketsTable>): TicketDto {
  return {
    id: t.id,
    orderId: t.order_id,
    app: t.app,
    category: t.category,
    subject: t.subject,
    description: t.description,
    attachments: t.attachments,
    status: t.status,
    resolution: t.resolution,
    refundPaise: t.refund_paise,
    createdAt: t.created_at.toISOString(),
    updatedAt: t.updated_at.toISOString(),
  };
}
