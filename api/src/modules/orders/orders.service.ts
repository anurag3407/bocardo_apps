import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../common/errors/app-error';
import { iso } from '../../common/http/schemas';
import { generateShortCode } from '../../common/utils/codes';
import { ENV, type Env } from '../../config/env';
import { DB, json, type Db, type Tx } from '../../infra/database/database';
import type { Order } from '../../infra/database/db.types';
import { PAYMENT_PROVIDER, type PaymentProvider } from '../../infra/payments/payment-provider';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { CatalogService } from '../catalog/catalog.service';
import { CouponsService } from '../promotions/coupons.service';
import { deliveryOtpHash } from './domain/delivery-otp';
import { OrderReader } from './order-reader.service';
import { ORDER_TIMEOUTS, OrderWorkflow } from './order-workflow.service';
import type {
  OrderPageDto,
  OrderTrackingDto,
  PlaceOrderDto,
  PlaceOrderResultDto,
} from './orders.dto';
import { QuoteService, type StoredQuote } from './quote.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
    private readonly workflow: OrderWorkflow,
    private readonly reader: OrderReader,
    private readonly quotes: QuoteService,
    private readonly catalog: CatalogService,
    private readonly coupons: CouponsService,
    private readonly outbox: OutboxService,
  ) {}

  async place(userId: string, input: PlaceOrderDto): Promise<PlaceOrderResultDto> {
    const quote = await this.quotes.consume(userId, input.quoteId);
    let order: Order;
    try {
      const { availability } = await this.catalog.availabilityOf(quote.restaurantId);
      if (!availability.isOpen)
        throw AppError.unprocessable(
          'RESTAURANT_CLOSED',
          `${quote.restaurantName} just stopped taking orders`,
        );
      if (input.paymentMethod === 'cod' && !quote.codAvailable) {
        throw AppError.unprocessable(
          'COD_NOT_AVAILABLE',
          'Cash on delivery is not available for this order',
        );
      }
      order = await this.workflow.run((tx) => this.createOrder(tx, userId, quote, input));
    } catch (err) {
      await this.quotes.release(quote.id);
      throw err;
    }

    if (order.payment_method === 'cod')
      return { order: await this.reader.customerView(order.id, userId), payment: null };

    try {
      const payment = await this.openPaymentSession(order);
      return { order: await this.reader.customerView(order.id, userId), payment };
    } catch (err) {
      this.logger.error(`payment session failed for ${order.id}: ${(err as Error).message}`);
      await this.workflow.run((tx) =>
        this.workflow.transition(tx, {
          orderId: order.id,
          to: 'PAYMENT_FAILED',
          actor: { type: 'system', id: null },
          patch: { payment_status: 'failed' },
        }),
      );
      throw new AppError(
        502,
        'PAYMENT_PROVIDER_ERROR',
        'Could not start the payment, please try again',
      );
    }
  }

  /** Re-opens checkout for an order still awaiting payment (app was killed, user retried). */
  async paymentSession(userId: string, orderId: string) {
    const order = await this.ownedOrder(userId, orderId);
    if (order.status !== 'PAYMENT_PENDING')
      throw AppError.conflict('PAYMENT_NOT_PENDING', 'This order does not need payment');
    const existing = await this.db
      .selectFrom('payments')
      .selectAll()
      .where('order_id', '=', orderId)
      .where('status', '=', 'pending')
      .executeTakeFirst();
    if (existing) {
      return {
        provider: this.payments.name,
        providerOrderId: existing.provider_order_id,
        amountPaise: existing.amount_paise,
        currency: 'INR' as const,
        publicKey: this.payments.publicKey,
      };
    }
    return this.openPaymentSession(order);
  }

  async cancelByCustomer(userId: string, orderId: string, reason: string) {
    await this.ownedOrder(userId, orderId);
    await this.workflow
      .run((tx) =>
        this.workflow.transition(tx, {
          orderId,
          to: 'CANCELLED',
          from: ['PAYMENT_PENDING', 'PLACED'],
          actor: { type: 'customer', id: userId },
          patch: { cancel_reason: reason, cancelled_by: 'customer' },
        }),
      )
      .catch((err) => {
        if (err instanceof AppError && err.code === 'ORDER_STATE_CHANGED') {
          throw AppError.conflict(
            'CANCEL_NOT_ALLOWED',
            'The restaurant has started preparing your order. Please contact support to cancel.',
          );
        }
        throw err;
      });
    return this.reader.customerView(orderId, userId);
  }

  async list(userId: string, cursor: string | undefined, limit: number): Promise<OrderPageDto> {
    let q = this.db
      .selectFrom('orders as o')
      .innerJoin('restaurants as r', 'r.id', 'o.restaurant_id')
      .select([
        'o.id',
        'o.short_code',
        'o.status',
        'o.dispatch_status',
        'o.total_paise',
        'o.payment_method',
        'o.created_at',
        'o.delivered_at',
        'r.id as restaurant_id',
        'r.name as restaurant_name',
        'r.logo_url',
      ])
      .where('o.customer_id', '=', userId)
      .orderBy('o.created_at', 'desc')
      .limit(limit + 1);
    if (cursor) q = q.where('o.created_at', '<', new Date(cursor));
    const rows = await q.execute();
    const page = rows.slice(0, limit);

    const items = page.length
      ? await this.db
          .selectFrom('order_items')
          .select(['order_id', 'name', 'quantity'])
          .where(
            'order_id',
            'in',
            page.map((r) => r.id),
          )
          .execute()
      : [];
    const itemsByOrder = new Map<string, { name: string; quantity: number }[]>();
    items.forEach((i) =>
      itemsByOrder.set(i.order_id, [...(itemsByOrder.get(i.order_id) ?? []), i]),
    );

    return {
      items: page.map((r) => {
        const lines = itemsByOrder.get(r.id) ?? [];
        return {
          id: r.id,
          shortCode: r.short_code,
          status: r.status,
          dispatchStatus: r.dispatch_status,
          restaurant: { id: r.restaurant_id, name: r.restaurant_name, logoUrl: r.logo_url },
          itemCount: lines.reduce((a, l) => a + l.quantity, 0),
          itemsPreview: lines.map((l) => `${l.quantity} × ${l.name}`).join(', '),
          totalPaise: r.total_paise,
          paymentMethod: r.payment_method,
          createdAt: r.created_at.toISOString(),
          deliveredAt: iso(r.delivered_at),
        };
      }),
      nextCursor: rows.length > limit ? page[page.length - 1].created_at.toISOString() : null,
    };
  }

  detail(userId: string, orderId: string) {
    return this.reader.customerView(orderId, userId);
  }

  /** Cheap polling fallback for when realtime is unavailable. */
  async tracking(userId: string, orderId: string): Promise<OrderTrackingDto> {
    const order = await this.ownedOrder(userId, orderId);
    const live =
      order.dispatch_status === 'PICKED' ||
      order.dispatch_status === 'AT_DROP' ||
      order.dispatch_status === 'ASSIGNED' ||
      order.dispatch_status === 'AT_RESTAURANT'
        ? await this.reader.liveRiderLocation(order.rider_id)
        : null;
    return {
      status: order.status,
      dispatchStatus: order.dispatch_status,
      estimatedDeliveryAt: iso(order.estimated_delivery_at),
      rider: live ? { lat: live.lat, lng: live.lng, heading: live.heading, at: live.at } : null,
    };
  }

  private async ownedOrder(userId: string, orderId: string) {
    const order = await this.db
      .selectFrom('orders')
      .selectAll()
      .where('id', '=', orderId)
      .executeTakeFirst();
    if (!order || order.customer_id !== userId) throw AppError.notFound('Order');
    return order;
  }

  private async createOrder(
    tx: Tx,
    userId: string,
    quote: StoredQuote,
    input: PlaceOrderDto,
  ): Promise<Order> {
    const orderId = randomUUID();
    // re-check the coupon inside the transaction: limits may have been reached since the quote
    const coupon = quote.couponId
      ? await this.coupons.evaluate(tx, {
          code: quote.pricing.couponCode!,
          userId,
          restaurantId: quote.restaurantId,
          itemTotalPaise: quote.pricing.itemTotalPaise,
        })
      : null;

    await tx
      .insertInto('orders')
      .values({
        id: orderId,
        short_code: generateShortCode(),
        customer_id: userId,
        restaurant_id: quote.restaurantId,
        city_id: quote.cityId,
        zone_id: quote.zoneId,
        status: 'PAYMENT_PENDING',
        payment_method: input.paymentMethod,
        delivery_address: json(quote.address),
        pickup_lat: quote.pickup.lat,
        pickup_lng: quote.pickup.lng,
        drop_lat: quote.address.lat,
        drop_lng: quote.address.lng,
        distance_m: quote.distanceM,
        item_total_paise: quote.pricing.itemTotalPaise,
        packaging_fee_paise: quote.pricing.packagingFeePaise,
        delivery_fee_paise: quote.pricing.deliveryFeePaise + quote.pricing.rainSurchargePaise,
        platform_fee_paise: quote.pricing.platformFeePaise,
        tax_paise: quote.pricing.taxPaise,
        discount_paise: quote.pricing.discountPaise,
        tip_paise: quote.pricing.tipPaise,
        total_paise: quote.pricing.totalPaise,
        pricing: json(quote.pricing),
        coupon_id: coupon?.id ?? null,
        prep_minutes: quote.prepMinutes,
        estimated_delivery_at: new Date(
          Date.now() + (quote.prepMinutes * 60 + quote.travelSeconds + 300) * 1000,
        ),
        delivery_otp_hash: deliveryOtpHash(this.env.APP_SECRET, orderId),
        customer_note: input.customerNote ?? null,
      })
      .execute();

    await tx
      .insertInto('order_items')
      .values(
        quote.lines.map((l) => ({
          order_id: orderId,
          menu_item_id: l.menuItemId,
          name: l.name,
          variant_name: l.variantName,
          addons: json(l.addons),
          is_veg: l.isVeg,
          unit_price_paise: l.unitPricePaise,
          quantity: l.quantity,
          line_total_paise: l.lineTotalPaise,
        })),
      )
      .execute();

    if (coupon) await this.coupons.redeem(tx, coupon, userId, orderId, quote.pricing.discountPaise);
    await this.workflow.recordEvent(
      tx,
      orderId,
      'ORDER_CREATED',
      { type: 'customer', id: userId },
      { quoteId: quote.id, paymentMethod: input.paymentMethod },
    );

    if (input.paymentMethod === 'cod') {
      return this.workflow.transition(tx, {
        orderId,
        to: 'PLACED',
        actor: { type: 'customer', id: userId },
      });
    }
    await this.outbox.enqueue(tx, 'job.schedule', {
      name: 'order.payment-expiry',
      payload: { orderId },
      delaySeconds: ORDER_TIMEOUTS.paymentSeconds,
      dedupeId: `payment-expiry-${orderId}`,
    });
    return tx.selectFrom('orders').selectAll().where('id', '=', orderId).executeTakeFirstOrThrow();
  }

  private async openPaymentSession(order: Order) {
    const session = await this.payments.createOrder({
      amountPaise: order.total_paise,
      receipt: order.short_code,
      notes: { orderId: order.id, shortCode: order.short_code },
    });
    await this.db
      .insertInto('payments')
      .values({
        order_id: order.id,
        provider: this.payments.name,
        provider_order_id: session.providerOrderId,
        amount_paise: session.amountPaise,
      })
      .execute();
    return { provider: this.payments.name, ...session };
  }
}
