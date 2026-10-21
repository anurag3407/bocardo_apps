import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { sql } from 'kysely';
import { AppError } from '../../common/errors/app-error';
import { DB, type Db, type Executor, type Tx } from '../../infra/database/database';
import type { Coupon, OrderStatus } from '../../infra/database/db.types';
import { OutboxRegistry } from '../../platform/outbox/outbox.registry';
import type { CouponTerms } from '../pricing/pricing.calculator';

const RELEASE_ON: OrderStatus[] = ['CANCELLED', 'REJECTED', 'PAYMENT_FAILED'];

@Injectable()
export class CouponsService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly outbox: OutboxRegistry,
  ) {}

  /** A cancelled/failed order gives the coupon back to the customer. */
  onModuleInit() {
    this.outbox.on('order.status_changed', async (p) => {
      if (RELEASE_ON.includes(p.to as OrderStatus)) await this.release(p.orderId as string);
    });
  }

  /** Validates a code for this customer/cart; throws a specific, user-presentable error. */
  async evaluate(
    executor: Executor,
    input: { code: string; userId: string; restaurantId: string; itemTotalPaise: number },
  ): Promise<Coupon> {
    const coupon = await executor
      .selectFrom('coupons')
      .selectAll()
      .where('code', '=', input.code.trim().toUpperCase())
      .executeTakeFirst();
    const now = new Date();
    if (!coupon || !coupon.is_active)
      throw AppError.unprocessable('COUPON_INVALID', 'This coupon code is not valid');
    if (coupon.valid_from > now || (coupon.valid_until && coupon.valid_until < now)) {
      throw AppError.unprocessable('COUPON_EXPIRED', 'This coupon has expired');
    }
    if (coupon.restaurant_id && coupon.restaurant_id !== input.restaurantId) {
      throw AppError.unprocessable(
        'COUPON_NOT_APPLICABLE',
        'This coupon is not valid for this restaurant',
      );
    }
    if (input.itemTotalPaise < coupon.min_order_paise) {
      throw AppError.unprocessable(
        'COUPON_MIN_ORDER',
        `Add items worth ₹${Math.ceil((coupon.min_order_paise - input.itemTotalPaise) / 100)} more to use this coupon`,
        {
          minOrderPaise: coupon.min_order_paise,
        },
      );
    }
    if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
      throw AppError.unprocessable('COUPON_LIMIT_REACHED', 'This coupon has been fully redeemed');
    }
    const { used } = await executor
      .selectFrom('coupon_redemptions')
      .select((eb) => eb.fn.countAll<number>().as('used'))
      .where('coupon_id', '=', coupon.id)
      .where('user_id', '=', input.userId)
      .executeTakeFirstOrThrow();
    if (used >= coupon.per_user_limit)
      throw AppError.unprocessable('COUPON_LIMIT_REACHED', 'You have already used this coupon');

    if (coupon.first_order_only) {
      const prior = await executor
        .selectFrom('orders')
        .select('id')
        .where('customer_id', '=', input.userId)
        .where('status', 'not in', ['PAYMENT_FAILED', 'CANCELLED', 'REJECTED'])
        .executeTakeFirst();
      if (prior)
        throw AppError.unprocessable(
          'COUPON_FIRST_ORDER_ONLY',
          'This coupon is only valid on your first order',
        );
    }
    return coupon;
  }

  /**
   * Claims a use inside the order transaction. The conditional UPDATE is the race guard:
   * two concurrent orders cannot both take the last available use.
   */
  async redeem(tx: Tx, coupon: Coupon, userId: string, orderId: string, discountPaise: number) {
    const claimed = await tx
      .updateTable('coupons')
      .set({ used_count: sql`used_count + 1` })
      .where('id', '=', coupon.id)
      .where((eb) => eb.or([eb('max_uses', 'is', null), eb('used_count', '<', eb.ref('max_uses'))]))
      .executeTakeFirst();
    if (Number(claimed.numUpdatedRows) === 0)
      throw AppError.unprocessable('COUPON_LIMIT_REACHED', 'This coupon has been fully redeemed');
    await tx
      .insertInto('coupon_redemptions')
      .values({
        coupon_id: coupon.id,
        user_id: userId,
        order_id: orderId,
        discount_paise: discountPaise,
      })
      .execute();
  }

  async release(orderId: string) {
    await this.db.transaction().execute(async (tx) => {
      const redemption = await tx
        .deleteFrom('coupon_redemptions')
        .where('order_id', '=', orderId)
        .returning('coupon_id')
        .executeTakeFirst();
      if (redemption) {
        await tx
          .updateTable('coupons')
          .set({ used_count: sql`greatest(used_count - 1, 0)` })
          .where('id', '=', redemption.coupon_id)
          .execute();
      }
    });
  }

  async listAvailable(restaurantId?: string) {
    const now = new Date();
    return this.db
      .selectFrom('coupons')
      .selectAll()
      .where('is_active', '=', true)
      .where('valid_from', '<=', now)
      .where((eb) => eb.or([eb('valid_until', 'is', null), eb('valid_until', '>', now)]))
      .where((eb) => eb.or([eb('max_uses', 'is', null), eb('used_count', '<', eb.ref('max_uses'))]))
      .where((eb) =>
        restaurantId
          ? eb.or([eb('restaurant_id', 'is', null), eb('restaurant_id', '=', restaurantId)])
          : eb('restaurant_id', 'is', null),
      )
      .orderBy('created_at', 'desc')
      .execute();
  }
}

export const toCouponTerms = (c: Coupon): CouponTerms => ({
  code: c.code,
  discountType: c.discount_type,
  discountValue: c.discount_value,
  maxDiscountPaise: c.max_discount_paise,
});
