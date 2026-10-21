import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { sql } from 'kysely';
import { AppError } from '../../common/errors/app-error';
import { DB, type Db } from '../../infra/database/database';
import type { LedgerAccount } from '../../infra/database/db.types';
import { AuditService } from '../../platform/audit/audit.service';
import { OutboxRegistry } from '../../platform/outbox/outbox.registry';
import { computeSettlement } from './settlement';

@Injectable()
export class LedgerService implements OnModuleInit {
  private readonly logger = new Logger(LedgerService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly registry: OutboxRegistry,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    this.registry.on('order.status_changed', async (p) => {
      if (p.to === 'DELIVERED') await this.settleDelivered(p.orderId as string);
    });
  }

  /** Writes the order's double-entry split exactly once. */
  async settleDelivered(orderId: string) {
    await this.db.transaction().execute(async (tx) => {
      const order = await tx
        .selectFrom('orders as o')
        .innerJoin('restaurants as r', 'r.id', 'o.restaurant_id')
        .leftJoin('coupons as c', 'c.id', 'o.coupon_id')
        .selectAll('o')
        .select(['r.commission_bps', 'c.restaurant_id as coupon_restaurant_id'])
        .where('o.id', '=', orderId)
        .forUpdate('o')
        .executeTakeFirstOrThrow();
      if (order.status !== 'DELIVERED' || !order.rider_id) return;
      const already = await tx
        .selectFrom('ledger_entries')
        .select('id')
        .where('order_id', '=', orderId)
        .executeTakeFirst();
      if (already) return;

      const offer = await tx
        .selectFrom('rider_offers')
        .select('payout_paise')
        .where('order_id', '=', orderId)
        .where('rider_id', '=', order.rider_id)
        .where('status', '=', 'accepted')
        .executeTakeFirst();

      const lines = computeSettlement({
        orderId,
        restaurantId: order.restaurant_id,
        riderId: order.rider_id,
        paymentMethod: order.payment_method,
        totalPaise: order.total_paise,
        itemTotalPaise: order.item_total_paise,
        packagingFeePaise: order.packaging_fee_paise,
        discountPaise: order.discount_paise,
        taxPaise: order.tax_paise,
        tipPaise: order.tip_paise,
        commissionBps: order.commission_bps,
        restaurantFundedDiscount: order.coupon_restaurant_id !== null,
        riderPayoutPaise: offer?.payout_paise ?? 0,
      });
      await tx
        .insertInto('ledger_entries')
        .values(
          lines.map((l) => ({
            order_id: orderId,
            account_type: l.accountType,
            account_id: l.accountId,
            amount_paise: l.amountPaise,
            entry_type: l.entryType,
          })),
        )
        .execute();
      if (order.payment_method === 'cod') {
        await tx
          .updateTable('riders')
          .set({ cash_in_hand_paise: sql`cash_in_hand_paise + ${order.total_paise}` })
          .where('id', '=', order.rider_id)
          .execute();
      }
    });
  }

  /** Unpaid balance (positive = Bocardo owes them; negative rider balance = cash to deposit). */
  async balance(accountType: LedgerAccount, accountId: string) {
    const row = await this.db
      .selectFrom('ledger_entries')
      .select((eb) => eb.fn.coalesce(eb.fn.sum<number>('amount_paise'), sql<number>`0`).as('total'))
      .where('account_type', '=', accountType)
      .where('account_id', '=', accountId)
      .where('payout_id', 'is', null)
      .executeTakeFirstOrThrow();
    return Number(row.total);
  }

  /** Earnings by day for dashboards (only earning lines, not cash movements). */
  async earnings(accountType: 'restaurant' | 'rider', accountId: string, from: Date, to: Date) {
    const entryType = accountType === 'rider' ? 'rider_earning' : 'restaurant_earning';
    const rows = await this.db
      .selectFrom('ledger_entries')
      .select([
        sql<string>`to_char(date_trunc('day', created_at at time zone 'Asia/Kolkata'), 'YYYY-MM-DD')`.as(
          'day',
        ),
        (eb) => eb.fn.sum<number>('amount_paise').as('amount'),
        (eb) => eb.fn.countAll<number>().as('orders'),
      ])
      .where('account_type', '=', accountType)
      .where('account_id', '=', accountId)
      .where('entry_type', '=', entryType)
      .where('created_at', '>=', from)
      .where('created_at', '<', to)
      .groupBy(sql`1`)
      .orderBy(sql`1`)
      .execute();
    const days = rows.map((r) => ({
      day: r.day,
      amountPaise: Number(r.amount),
      orders: Number(r.orders),
    }));
    return {
      totalPaise: days.reduce((a, d) => a + d.amountPaise, 0),
      orders: days.reduce((a, d) => a + d.orders, 0),
      days,
      unpaidBalancePaise: await this.balance(accountType, accountId),
    };
  }

  /** Rider hands COD cash to a hub: reduces what they owe. */
  async recordCashDeposit(riderId: string, amountPaise: number, actorId: string) {
    if (amountPaise <= 0) throw AppError.badRequest('INVALID_AMOUNT', 'Amount must be positive');
    await this.db.transaction().execute(async (tx) => {
      await tx
        .insertInto('ledger_entries')
        .values([
          {
            account_type: 'rider',
            account_id: riderId,
            amount_paise: amountPaise,
            entry_type: 'cod_cash_deposit',
            order_id: null,
          },
          {
            account_type: 'cash',
            account_id: null,
            amount_paise: -amountPaise,
            entry_type: 'cod_cash_deposit',
            order_id: null,
          },
        ])
        .execute();
      await tx
        .updateTable('riders')
        .set({ cash_in_hand_paise: sql`greatest(cash_in_hand_paise - ${amountPaise}, 0)` })
        .where('id', '=', riderId)
        .execute();
      await this.audit.record(tx, {
        actorId,
        action: 'rider.cash_deposit',
        entityType: 'rider',
        entityId: riderId,
        after: { amountPaise },
      });
    });
  }

  /**
   * Creates payouts for every restaurant/rider with a positive unpaid balance and
   * attaches the covered ledger rows. Transfers are executed by finance (RazorpayX/Route).
   */
  async runPayouts(actorId: string) {
    const periodEnd = new Date();
    return this.db.transaction().execute(async (tx) => {
      const balances = await tx
        .selectFrom('ledger_entries')
        .select([
          'account_type',
          'account_id',
          (eb) => eb.fn.sum<number>('amount_paise').as('total'),
        ])
        .where('account_type', 'in', ['restaurant', 'rider'])
        .where('payout_id', 'is', null)
        .where('created_at', '<=', periodEnd)
        .groupBy(['account_type', 'account_id'])
        .having((eb) => eb.fn.sum('amount_paise'), '>', 0)
        .execute();

      let count = 0;
      for (const b of balances) {
        if (!b.account_id) continue;
        const payout = await tx
          .insertInto('payouts')
          .values({
            account_type: b.account_type as 'restaurant' | 'rider',
            account_id: b.account_id,
            amount_paise: Number(b.total),
            period_end: periodEnd,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await tx
          .updateTable('ledger_entries')
          .set({ payout_id: payout.id })
          .where('account_type', '=', b.account_type)
          .where('account_id', '=', b.account_id)
          .where('payout_id', 'is', null)
          .where('created_at', '<=', periodEnd)
          .execute();
        count++;
      }
      await this.audit.record(tx, {
        actorId,
        action: 'payouts.run',
        entityType: 'payout',
        after: { count, periodEnd },
      });
      this.logger.log(`created ${count} payouts`);
      return { created: count };
    });
  }

  async markPayoutPaid(payoutId: string, providerRef: string, actorId: string) {
    await this.db.transaction().execute(async (tx) => {
      const updated = await tx
        .updateTable('payouts')
        .set({ status: 'paid', provider_ref: providerRef })
        .where('id', '=', payoutId)
        .where('status', 'in', ['pending', 'processing'])
        .executeTakeFirst();
      if (Number(updated.numUpdatedRows) === 0)
        throw AppError.conflict('PAYOUT_NOT_PENDING', 'Payout is not pending');
      await this.audit.record(tx, {
        actorId,
        action: 'payout.mark_paid',
        entityType: 'payout',
        entityId: payoutId,
        after: { providerRef },
      });
    });
  }
}
