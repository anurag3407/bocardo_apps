import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { sql } from 'kysely';
import { AppError } from '../../common/errors/app-error';
import { DB, type Db, type Executor } from '../../infra/database/database';
import type { OrderStatus } from '../../infra/database/db.types';
import { PAYMENT_PROVIDER, type PaymentProvider } from '../../infra/payments/payment-provider';
import { OutboxProcessor } from '../../platform/outbox/outbox.processor';
import { OutboxRegistry } from '../../platform/outbox/outbox.registry';
import { OutboxService } from '../../platform/outbox/outbox.service';

const AUTO_REFUND_ON: OrderStatus[] = ['CANCELLED', 'REJECTED'];
const MAX_REFUND_ATTEMPTS = 8;

/**
 * Refunds are rows first, money second: a `pending` refund is created inside the business
 * transaction and the provider call happens from the outbox with retries.
 */
@Injectable()
export class RefundsService implements OnModuleInit {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly registry: OutboxRegistry,
    private readonly outbox: OutboxService,
    private readonly processor: OutboxProcessor,
  ) {}

  onModuleInit() {
    this.registry.on('order.status_changed', async (p) => {
      if (!AUTO_REFUND_ON.includes(p.to as OrderStatus)) return;
      await this.db
        .transaction()
        .execute((tx) => this.refundFullIfPaid(tx, p.orderId as string, 'order_cancelled'));
      this.processor.poke();
    });
    this.registry.on('refund.process', (p) => this.process(p.refundId as string));
  }

  /** Idempotent: one full "reason" refund per order. */
  async refundFullIfPaid(executor: Executor, orderId: string, reason: string) {
    const payment = await executor
      .selectFrom('payments')
      .selectAll()
      .where('order_id', '=', orderId)
      .where('status', '=', 'captured')
      .executeTakeFirst();
    if (!payment) return;
    const existing = await executor
      .selectFrom('refunds')
      .select('id')
      .where('order_id', '=', orderId)
      .where('reason', '=', reason)
      .executeTakeFirst();
    if (existing) return;
    const refundable = payment.amount_paise - payment.refunded_paise;
    if (refundable > 0) await this.create(executor, { orderId, amountPaise: refundable, reason });
  }

  /** Creates a pending refund against the captured online payment of an order. */
  async create(
    executor: Executor,
    input: { orderId: string; amountPaise: number; reason: string },
  ) {
    const payment = await executor
      .selectFrom('payments')
      .selectAll()
      .where('order_id', '=', input.orderId)
      .where('status', 'in', ['captured', 'partially_refunded'])
      .executeTakeFirst();
    if (!payment)
      throw AppError.unprocessable(
        'REFUND_NOT_POSSIBLE',
        'Only captured online payments can be refunded; settle COD refunds manually',
      );

    const { pending } = await executor
      .selectFrom('refunds')
      .select((eb) =>
        eb.fn.coalesce(eb.fn.sum<number>('amount_paise'), sql<number>`0`).as('pending'),
      )
      .where('payment_id', '=', payment.id)
      .where('status', '=', 'pending')
      .executeTakeFirstOrThrow();
    const refundable = payment.amount_paise - payment.refunded_paise - Number(pending);
    if (input.amountPaise > refundable) {
      throw AppError.unprocessable(
        'REFUND_EXCEEDS_PAYMENT',
        `At most ₹${refundable / 100} can be refunded`,
        { refundablePaise: refundable },
      );
    }
    const refund = await executor
      .insertInto('refunds')
      .values({
        order_id: input.orderId,
        payment_id: payment.id,
        amount_paise: input.amountPaise,
        reason: input.reason,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await this.outbox.enqueue(executor, 'refund.process', { refundId: refund.id });
    return refund.id;
  }

  async process(refundId: string) {
    const refund = await this.db
      .selectFrom('refunds')
      .selectAll()
      .where('id', '=', refundId)
      .executeTakeFirst();
    if (!refund || refund.status !== 'pending' || !refund.payment_id) return;
    const payment = await this.db
      .selectFrom('payments')
      .selectAll()
      .where('id', '=', refund.payment_id)
      .executeTakeFirstOrThrow();
    if (!payment.provider_payment_id)
      throw new Error(`payment ${payment.id} has no provider payment id`);

    try {
      const res = await this.provider.refund({
        providerPaymentId: payment.provider_payment_id,
        amountPaise: refund.amount_paise,
        notes: { orderId: refund.order_id, refundId: refund.id, reason: refund.reason },
      });
      await this.db.transaction().execute(async (tx) => {
        await tx
          .updateTable('refunds')
          .set({
            status: 'processed',
            provider_refund_id: res.providerRefundId,
            attempts: sql`attempts + 1`,
          })
          .where('id', '=', refund.id)
          .execute();
        const updated = await tx
          .updateTable('payments')
          .set({ refunded_paise: sql`refunded_paise + ${refund.amount_paise}` })
          .where('id', '=', payment.id)
          .returning(['refunded_paise', 'amount_paise'])
          .executeTakeFirstOrThrow();
        const status =
          updated.refunded_paise >= updated.amount_paise ? 'refunded' : 'partially_refunded';
        await tx.updateTable('payments').set({ status }).where('id', '=', payment.id).execute();
        await tx
          .updateTable('orders')
          .set({ payment_status: status })
          .where('id', '=', refund.order_id)
          .execute();
      });
    } catch (err) {
      const message = (err as Error).message;
      const attempts = refund.attempts + 1;
      const failed = attempts >= MAX_REFUND_ATTEMPTS;
      await this.db
        .updateTable('refunds')
        .set({
          attempts,
          last_error: message.slice(0, 1000),
          ...(failed ? { status: 'failed' as const } : {}),
        })
        .where('id', '=', refund.id)
        .execute();
      if (failed) {
        this.logger.error(`refund ${refund.id} failed permanently: ${message}`);
        return;
      }
      throw err; // outbox retries with backoff
    }
  }

  /** Provider-side confirmation/failure from webhooks. */
  async markFromWebhook(providerRefundId: string, status: 'processed' | 'failed') {
    await this.db
      .updateTable('refunds')
      .set({ status })
      .where('provider_refund_id', '=', providerRefundId)
      .execute();
  }
}
