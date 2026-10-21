import { Inject, Injectable } from '@nestjs/common';
import type { Selectable } from 'kysely';
import { AppError } from '../../common/errors/app-error';
import { iso } from '../../common/http/schemas';
import { DB, json, type Db } from '../../infra/database/database';
import type { CouponsTable } from '../../infra/database/db.types';
import { AuditService } from '../../platform/audit/audit.service';
import { OutboxProcessor } from '../../platform/outbox/outbox.processor';
import { toTicket } from '../feedback/feedback.service';
import { RefundsService } from '../payments/refunds.service';
import type {
  AuditQueryDto,
  CreateCouponDto,
  PayoutsQueryDto,
  TicketsQueryDto,
  UpdateCouponDto,
  UpdateTicketDto,
} from './admin.dto';

@Injectable()
export class AdminCommerceService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly refunds: RefundsService,
    private readonly outbox: OutboxProcessor,
  ) {}

  // ── Coupons ─────────────────────────────────────────────────────────────
  async coupons() {
    const rows = await this.db
      .selectFrom('coupons')
      .selectAll()
      .orderBy('created_at', 'desc')
      .limit(500)
      .execute();
    return rows.map(toAdminCoupon);
  }

  async createCoupon(actorId: string, input: CreateCouponDto) {
    if (input.discountType === 'percent' && input.discountValue > 100)
      throw AppError.badRequest('INVALID_PERCENT', 'Percentage cannot exceed 100');
    const exists = await this.db
      .selectFrom('coupons')
      .select('id')
      .where('code', '=', input.code)
      .executeTakeFirst();
    if (exists) throw AppError.conflict('COUPON_EXISTS', 'A coupon with this code already exists');
    const row = await this.db
      .insertInto('coupons')
      .values({
        code: input.code,
        description: input.description ?? null,
        discount_type: input.discountType,
        discount_value: input.discountValue,
        max_discount_paise: input.maxDiscountPaise ?? null,
        min_order_paise: input.minOrderPaise,
        valid_from: input.validFrom ?? new Date(),
        valid_until: input.validUntil ?? null,
        max_uses: input.maxUses ?? null,
        per_user_limit: input.perUserLimit,
        first_order_only: input.firstOrderOnly,
        restaurant_id: input.restaurantId ?? null,
        is_active: input.isActive,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await this.audit.record(this.db, {
      actorId,
      action: 'coupon.create',
      entityType: 'coupon',
      entityId: row.id,
      after: input,
    });
    return toAdminCoupon(row);
  }

  async updateCoupon(id: string, actorId: string, input: UpdateCouponDto) {
    const row = await this.db
      .updateTable('coupons')
      .set({
        ...(input.description !== undefined && { description: input.description ?? null }),
        ...(input.discountType !== undefined && { discount_type: input.discountType }),
        ...(input.discountValue !== undefined && { discount_value: input.discountValue }),
        ...(input.maxDiscountPaise !== undefined && {
          max_discount_paise: input.maxDiscountPaise ?? null,
        }),
        ...(input.minOrderPaise !== undefined && { min_order_paise: input.minOrderPaise }),
        ...(input.validFrom !== undefined && { valid_from: input.validFrom }),
        ...(input.validUntil !== undefined && { valid_until: input.validUntil ?? null }),
        ...(input.maxUses !== undefined && { max_uses: input.maxUses ?? null }),
        ...(input.perUserLimit !== undefined && { per_user_limit: input.perUserLimit }),
        ...(input.firstOrderOnly !== undefined && { first_order_only: input.firstOrderOnly }),
        ...(input.restaurantId !== undefined && { restaurant_id: input.restaurantId ?? null }),
        ...(input.isActive !== undefined && { is_active: input.isActive }),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    if (!row) throw AppError.notFound('Coupon');
    await this.audit.record(this.db, {
      actorId,
      action: 'coupon.update',
      entityType: 'coupon',
      entityId: id,
      after: input,
    });
    return toAdminCoupon(row);
  }

  // ── Payouts ─────────────────────────────────────────────────────────────
  async payouts(q: PayoutsQueryDto) {
    const rows = await this.db
      .selectFrom('payouts as p')
      .leftJoin('restaurants as r', (j) =>
        j.onRef('r.id', '=', 'p.account_id').on('p.account_type', '=', 'restaurant'),
      )
      .leftJoin('profiles as u', (j) =>
        j.onRef('u.id', '=', 'p.account_id').on('p.account_type', '=', 'rider'),
      )
      .selectAll('p')
      .select((eb) => eb.fn.coalesce('r.name', 'u.full_name').as('account_name'))
      .$if(!!q.status, (b) => b.where('p.status', '=', q.status!))
      .$if(!!q.cursor, (b) => b.where('p.created_at', '<', new Date(q.cursor!)))
      .orderBy('p.created_at', 'desc')
      .limit(q.limit + 1)
      .execute();
    const page = rows.slice(0, q.limit);
    return {
      items: page.map((p) => ({
        id: p.id,
        accountType: p.account_type,
        accountId: p.account_id,
        accountName: p.account_name,
        amountPaise: p.amount_paise,
        status: p.status,
        providerRef: p.provider_ref,
        periodEnd: p.period_end.toISOString(),
        createdAt: p.created_at.toISOString(),
      })),
      nextCursor: rows.length > q.limit ? page[page.length - 1].created_at.toISOString() : null,
    };
  }

  // ── Support ─────────────────────────────────────────────────────────────
  async tickets(q: TicketsQueryDto) {
    const rows = await this.db
      .selectFrom('support_tickets')
      .selectAll()
      .$if(!!q.status, (b) => b.where('status', '=', q.status!))
      .$if(!!q.cursor, (b) => b.where('created_at', '<', new Date(q.cursor!)))
      .orderBy('created_at', 'desc')
      .limit(q.limit + 1)
      .execute();
    const page = rows.slice(0, q.limit);
    return {
      items: page.map(toTicket),
      nextCursor: rows.length > q.limit ? page[page.length - 1].created_at.toISOString() : null,
    };
  }

  /** Resolving with a refund issues it against the linked order's online payment. */
  async updateTicket(id: string, actorId: string, input: UpdateTicketDto) {
    const ticket = await this.db.transaction().execute(async (tx) => {
      const current = await tx
        .selectFrom('support_tickets')
        .selectAll()
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst();
      if (!current) throw AppError.notFound('Ticket');
      if (input.refundPaise) {
        if (!current.order_id)
          throw AppError.unprocessable('NO_ORDER', 'This ticket is not linked to an order');
        if (current.refund_paise)
          throw AppError.conflict(
            'ALREADY_REFUNDED',
            'A refund was already issued for this ticket',
          );
        await this.refunds.create(tx, {
          orderId: current.order_id,
          amountPaise: input.refundPaise,
          reason: `ticket:${id}`,
        });
      }
      const updated = await tx
        .updateTable('support_tickets')
        .set({
          ...(input.status !== undefined && { status: input.status }),
          ...(input.resolution !== undefined && { resolution: input.resolution }),
          ...(input.assignToMe && { assigned_to: actorId }),
          ...(input.refundPaise !== undefined && { refund_paise: input.refundPaise }),
        })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();
      await this.audit.record(tx, {
        actorId,
        action: 'ticket.update',
        entityType: 'ticket',
        entityId: id,
        before: { status: current.status },
        after: input,
      });
      return updated;
    });
    this.outbox.poke();
    return toTicket(ticket);
  }

  // ── Audit & config ──────────────────────────────────────────────────────
  async auditLogs(q: AuditQueryDto) {
    const rows = await this.db
      .selectFrom('audit_logs as a')
      .leftJoin('profiles as p', 'p.id', 'a.actor_id')
      .selectAll('a')
      .select('p.full_name as actor_name')
      .$if(!!q.entityType, (b) => b.where('a.entity_type', '=', q.entityType!))
      .$if(!!q.entityId, (b) => b.where('a.entity_id', '=', q.entityId!))
      .$if(!!q.cursor, (b) => b.where('a.id', '<', Number(q.cursor)))
      .orderBy('a.id', 'desc')
      .limit(q.limit + 1)
      .execute();
    const page = rows.slice(0, q.limit);
    return {
      items: page.map((a) => ({
        id: a.id,
        actorId: a.actor_id,
        actorName: a.actor_name,
        action: a.action,
        entityType: a.entity_type,
        entityId: a.entity_id,
        before: a.before,
        after: a.after,
        createdAt: a.created_at.toISOString(),
      })),
      nextCursor: rows.length > q.limit ? String(page[page.length - 1].id) : null,
    };
  }

  async appConfig() {
    const rows = await this.db.selectFrom('app_config').selectAll().orderBy('key').execute();
    return rows.map((r) => ({ key: r.key, value: r.value, updatedAt: r.updated_at.toISOString() }));
  }

  async setAppConfig(key: string, value: unknown, actorId: string) {
    if (!/^[a-z_]{2,40}$/.test(key))
      throw AppError.badRequest('INVALID_KEY', 'Config keys are lower_snake_case');
    const before = await this.db
      .selectFrom('app_config')
      .select('value')
      .where('key', '=', key)
      .executeTakeFirst();
    const row = await this.db
      .insertInto('app_config')
      .values({ key, value: json(value) })
      .onConflict((oc) =>
        oc.column('key').doUpdateSet({ value: json(value), updated_at: new Date() }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
    await this.audit.record(this.db, {
      actorId,
      action: 'config.set',
      entityType: 'app_config',
      entityId: key,
      before: before?.value,
      after: value,
    });
    return { key: row.key, value: row.value, updatedAt: row.updated_at.toISOString() };
  }
}

function toAdminCoupon(c: Selectable<CouponsTable>) {
  return {
    id: c.id,
    code: c.code,
    description: c.description,
    discountType: c.discount_type,
    discountValue: c.discount_value,
    maxDiscountPaise: c.max_discount_paise,
    minOrderPaise: c.min_order_paise,
    validFrom: c.valid_from.toISOString(),
    validUntil: iso(c.valid_until),
    firstOrderOnly: c.first_order_only,
    restaurantId: c.restaurant_id,
    usedCount: c.used_count,
    maxUses: c.max_uses,
    perUserLimit: c.per_user_limit,
    isActive: c.is_active,
  };
}
