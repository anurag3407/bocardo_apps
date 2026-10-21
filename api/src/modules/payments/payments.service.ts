import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';
import { DB, json, type Db } from '../../infra/database/database';
import { PAYMENT_PROVIDER, type PaymentProvider } from '../../infra/payments/payment-provider';
import { OrderReader } from '../orders/order-reader.service';
import { OrderWorkflow } from '../orders/order-workflow.service';
import { RefundsService } from './refunds.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly workflow: OrderWorkflow,
    private readonly reader: OrderReader,
    private readonly refunds: RefundsService,
  ) {}

  /** Called by the app right after checkout succeeds. The webhook may arrive first or later. */
  async verifyFromClient(
    userId: string,
    input: {
      orderId: string;
      providerOrderId: string;
      providerPaymentId: string;
      signature: string;
    },
  ) {
    const payment = await this.db
      .selectFrom('payments as p')
      .innerJoin('orders as o', 'o.id', 'p.order_id')
      .select(['p.id', 'o.customer_id'])
      .where('p.provider_order_id', '=', input.providerOrderId)
      .where('p.order_id', '=', input.orderId)
      .executeTakeFirst();
    if (!payment || payment.customer_id !== userId) throw AppError.notFound('Payment');
    if (!this.provider.verifyPaymentSignature(input))
      throw AppError.badRequest('PAYMENT_SIGNATURE_INVALID', 'Payment could not be verified');

    await this.capture(input.providerOrderId, input.providerPaymentId, null);
    return this.reader.customerView(input.orderId, userId);
  }

  /**
   * Idempotent capture. If the order already expired or was cancelled (late UPI capture),
   * the money is refunded automatically instead of reviving the order.
   */
  async capture(providerOrderId: string, providerPaymentId: string, method: string | null) {
    await this.workflow.run(async (tx) => {
      const payment = await tx
        .selectFrom('payments')
        .selectAll()
        .where('provider_order_id', '=', providerOrderId)
        .forUpdate()
        .executeTakeFirst();
      if (!payment) {
        this.logger.warn(`capture for unknown provider order ${providerOrderId}`);
        return;
      }
      if (payment.status !== 'pending') return;

      await tx
        .updateTable('payments')
        .set({ status: 'captured', provider_payment_id: providerPaymentId, method })
        .where('id', '=', payment.id)
        .execute();

      const order = await this.workflow.lock(tx, payment.order_id);
      if (order.status === 'PAYMENT_PENDING') {
        await this.workflow.transition(tx, {
          orderId: order.id,
          to: 'PLACED',
          actor: { type: 'system', id: null },
          patch: { payment_status: 'captured' },
          metadata: { providerPaymentId },
        });
        return;
      }
      await tx
        .updateTable('orders')
        .set({ payment_status: 'captured' })
        .where('id', '=', order.id)
        .execute();
      await this.workflow.recordEvent(
        tx,
        order.id,
        'LATE_PAYMENT_CAPTURED',
        { type: 'system', id: null },
        { providerPaymentId, status: order.status },
      );
      await this.refunds.refundFullIfPaid(tx, order.id, 'late_capture');
    });
  }

  async handleWebhook(rawBody: string, signature: string, eventId: string | undefined) {
    if (!this.provider.verifyWebhookSignature(rawBody, signature))
      throw AppError.unauthorized('Invalid webhook signature');
    const event = JSON.parse(rawBody) as RazorpayWebhook;

    // providers retry and may deliver twice: process each event id once
    const dedupeId =
      eventId ??
      `${event.event}:${event.payload?.payment?.entity?.id ?? event.payload?.refund?.entity?.id ?? event.created_at}`;
    const inserted = await this.db
      .insertInto('webhook_events')
      .values({ id: dedupeId, provider: this.provider.name, event_type: event.event })
      .onConflict((oc) => oc.column('id').doNothing())
      .returning('id')
      .executeTakeFirst();
    if (!inserted) return;

    const payment = event.payload?.payment?.entity;
    const refund = event.payload?.refund?.entity;
    switch (event.event) {
      case 'payment.captured':
      case 'order.paid':
        if (payment?.order_id)
          await this.capture(payment.order_id, payment.id, payment.method ?? null);
        break;
      case 'payment.failed':
        this.logger.log(
          `payment failed for ${payment?.order_id}: ${payment?.error_description ?? 'unknown'}`,
        );
        await this.db
          .insertInto('order_events')
          .columns(['order_id', 'event', 'actor_type', 'metadata'])
          .expression((eb) =>
            eb
              .selectFrom('payments')
              .select([
                'order_id',
                eb.val('PAYMENT_ATTEMPT_FAILED').as('event'),
                eb.val('system').as('actor_type'),
                eb.val(json({ reason: payment?.error_description ?? null })).as('metadata'),
              ])
              .where('provider_order_id', '=', payment?.order_id ?? ''),
          )
          .execute();
        break;
      case 'refund.processed':
        if (refund?.id) await this.refunds.markFromWebhook(refund.id, 'processed');
        break;
      case 'refund.failed':
        if (refund?.id) await this.refunds.markFromWebhook(refund.id, 'failed');
        break;
    }
  }
}

interface RazorpayWebhook {
  event: string;
  created_at: number;
  payload?: {
    payment?: {
      entity: { id: string; order_id: string; method?: string; error_description?: string };
    };
    refund?: { entity: { id: string; payment_id: string } };
  };
}
