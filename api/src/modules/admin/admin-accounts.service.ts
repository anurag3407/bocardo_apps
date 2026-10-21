import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { AppError } from '../../common/errors/app-error';
import { iso } from '../../common/http/schemas';
import { DB, type Db } from '../../infra/database/database';
import type { AdminRole, Restaurant } from '../../infra/database/db.types';
import { AuditService } from '../../platform/audit/audit.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { CatalogCache } from '../catalog/catalog.cache';
import { RiderPool } from '../dispatch/rider-pool.service';
import type {
  AdminRestaurantDto,
  AdminRestaurantsQueryDto,
  AdminRiderDto,
  AdminRidersQueryDto,
  AdminUsersQueryDto,
  GrantAdminDto,
  RestaurantStatusDto,
  RestaurantTermsDto,
  RiderKycDto,
} from './admin.dto';

@Injectable()
export class AdminAccountsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly pool: RiderPool,
    private readonly cache: CatalogCache,
  ) {}

  // ── Restaurants ─────────────────────────────────────────────────────────
  async restaurants(q: AdminRestaurantsQueryDto) {
    const rows = await this.db
      .selectFrom('restaurants')
      .selectAll()
      .$if(!!q.status, (b) => b.where('status', '=', q.status!))
      .$if(!!q.q, (b) => b.where('name', 'ilike', `%${q.q}%`))
      .$if(!!q.cursor, (b) => b.where('created_at', '<', new Date(q.cursor!)))
      .orderBy('created_at', 'desc')
      .limit(q.limit + 1)
      .execute();
    const page = rows.slice(0, q.limit);
    return {
      items: page.map(toAdminRestaurant),
      nextCursor: rows.length > q.limit ? page[page.length - 1].created_at.toISOString() : null,
    };
  }

  async restaurant(id: string) {
    const r = await this.db
      .selectFrom('restaurants')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!r) throw AppError.notFound('Restaurant');
    return toAdminRestaurant(r);
  }

  async setRestaurantStatus(id: string, actorId: string, input: RestaurantStatusDto) {
    const before = await this.restaurant(id);
    await this.db.transaction().execute(async (tx) => {
      await tx
        .updateTable('restaurants')
        .set({ status: input.status, ...(input.status !== 'active' ? { is_open: false } : {}) })
        .where('id', '=', id)
        .execute();
      await this.audit.record(tx, {
        actorId,
        action: 'restaurant.status',
        entityType: 'restaurant',
        entityId: id,
        before: { status: before.status },
        after: input,
      });
      await this.outbox.enqueue(tx, 'push.restaurant', {
        restaurantId: id,
        message: {
          title:
            input.status === 'active'
              ? 'Your restaurant is live on Bocardo!'
              : `Restaurant ${input.status}`,
          body:
            input.status === 'active'
              ? 'Switch on "Accepting orders" to start receiving orders.'
              : (input.reason ?? 'Contact partner support for details.'),
        },
      });
    });
    await this.cache.invalidateMenu(id);
    return this.restaurant(id);
  }

  async setRestaurantTerms(id: string, actorId: string, input: RestaurantTermsDto) {
    const before = await this.restaurant(id);
    await this.db.transaction().execute(async (tx) => {
      await tx
        .updateTable('restaurants')
        .set({
          ...(input.commissionBps !== undefined && { commission_bps: input.commissionBps }),
          ...(input.deliveryRadiusM !== undefined && { delivery_radius_m: input.deliveryRadiusM }),
        })
        .where('id', '=', id)
        .execute();
      await this.audit.record(tx, {
        actorId,
        action: 'restaurant.terms',
        entityType: 'restaurant',
        entityId: id,
        before: { commissionBps: before.commissionBps, deliveryRadiusM: before.deliveryRadiusM },
        after: input,
      });
    });
    return this.restaurant(id);
  }

  // ── Riders ──────────────────────────────────────────────────────────────
  private ridersQuery() {
    return this.db
      .selectFrom('riders as r')
      .innerJoin('profiles as p', 'p.id', 'r.id')
      .selectAll('r')
      .select(['p.full_name', 'p.phone']);
  }

  async riders(q: AdminRidersQueryDto) {
    const rows = await this.ridersQuery()
      .$if(!!q.kycStatus, (b) => b.where('r.kyc_status', '=', q.kycStatus!))
      .$if(q.online !== undefined, (b) => b.where('r.is_online', '=', q.online!))
      .$if(!!q.q, (b) =>
        b.where((eb) =>
          eb.or([
            eb('p.full_name', 'ilike', `%${q.q}%`),
            eb('p.phone', 'like', `%${q.q!.replace(/\D/g, '')}%`),
          ]),
        ),
      )
      .$if(!!q.cursor, (b) => b.where('r.created_at', '<', new Date(q.cursor!)))
      .orderBy('r.created_at', 'desc')
      .limit(q.limit + 1)
      .execute();
    const page = rows.slice(0, q.limit);
    return {
      items: page.map(toAdminRider),
      nextCursor: rows.length > q.limit ? page[page.length - 1].created_at.toISOString() : null,
    };
  }

  async rider(id: string) {
    const r = await this.ridersQuery().where('r.id', '=', id).executeTakeFirst();
    if (!r) throw AppError.notFound('Rider');
    return toAdminRider(r);
  }

  async setRiderKyc(id: string, actorId: string, input: RiderKycDto) {
    const before = await this.rider(id);
    if (input.status !== 'approved' && before.currentOrderId) {
      throw AppError.conflict('RIDER_ON_DELIVERY', 'Reassign the rider’s current order first');
    }
    const rider = await this.db.transaction().execute(async (tx) => {
      const updated = await tx
        .updateTable('riders')
        .set({
          kyc_status: input.status,
          ...(input.status !== 'approved' ? { is_online: false } : {}),
        })
        .where('id', '=', id)
        .returning(['city_id'])
        .executeTakeFirstOrThrow();
      await this.audit.record(tx, {
        actorId,
        action: 'rider.kyc',
        entityType: 'rider',
        entityId: id,
        before: { kycStatus: before.kycStatus },
        after: input,
      });
      await this.outbox.enqueue(tx, 'push.user', {
        userId: id,
        app: 'rider',
        message: {
          title: input.status === 'approved' ? 'You are approved!' : `Account ${input.status}`,
          body:
            input.status === 'approved'
              ? 'Go online to start receiving delivery requests.'
              : (input.reason ?? 'Contact rider support for details.'),
        },
      });
      return updated;
    });
    if (input.status !== 'approved' && rider.city_id) await this.pool.goOffline(id, rider.city_id);
    return this.rider(id);
  }

  // ── Users & admins ──────────────────────────────────────────────────────
  async users(q: AdminUsersQueryDto) {
    const rows = await this.db
      .selectFrom('profiles as p')
      .selectAll('p')
      .select(
        sql<number>`(select count(*) from orders o where o.customer_id = p.id)`.as('order_count'),
      )
      .$if(!!q.q, (b) =>
        b.where((eb) =>
          eb.or([
            eb('p.full_name', 'ilike', `%${q.q}%`),
            eb('p.email', 'ilike', `%${q.q}%`),
            eb('p.phone', 'like', `%${q.q!.replace(/\D/g, '') || q.q}%`),
          ]),
        ),
      )
      .$if(!!q.cursor, (b) => b.where('p.created_at', '<', new Date(q.cursor!)))
      .orderBy('p.created_at', 'desc')
      .limit(q.limit + 1)
      .execute();
    const page = rows.slice(0, q.limit);
    return {
      items: page.map((p) => ({
        id: p.id,
        fullName: p.full_name,
        phone: p.phone,
        email: p.email,
        roles: p.roles,
        adminRole: p.admin_role,
        isBlocked: p.is_blocked,
        orderCount: Number(p.order_count),
        createdAt: p.created_at.toISOString(),
      })),
      nextCursor: rows.length > q.limit ? page[page.length - 1].created_at.toISOString() : null,
    };
  }

  /** Blocked users are rejected by the auth guard on their next token refresh. */
  async setBlocked(userId: string, actorId: string, blocked: boolean, reason?: string) {
    if (userId === actorId)
      throw AppError.badRequest('CANNOT_BLOCK_SELF', 'You cannot block yourself');
    await this.db.transaction().execute(async (tx) => {
      const res = await tx
        .updateTable('profiles')
        .set({ is_blocked: blocked })
        .where('id', '=', userId)
        .executeTakeFirst();
      if (Number(res.numUpdatedRows) === 0) throw AppError.notFound('User');
      await this.audit.record(tx, {
        actorId,
        action: blocked ? 'user.block' : 'user.unblock',
        entityType: 'user',
        entityId: userId,
        after: { reason },
      });
    });
  }

  /** super_admin only: grant/revoke admin access by email or phone. */
  async grantAdmin(actorId: string, input: GrantAdminDto) {
    if (!input.email && !input.phone)
      throw AppError.badRequest('IDENTIFIER_REQUIRED', 'Provide an email or phone');
    const profile = await this.db
      .selectFrom('profiles')
      .select(['id', 'roles', 'admin_role'])
      .$if(!!input.email, (b) => b.where('email', '=', input.email!))
      .$if(!input.email && !!input.phone, (b) =>
        b.where('phone', '=', input.phone!.replace(/\D/g, '')),
      )
      .executeTakeFirst();
    if (!profile) throw AppError.notFound('User (they must sign in once first)');
    if (profile.id === actorId && input.adminRole !== 'super_admin')
      throw AppError.badRequest(
        'CANNOT_DEMOTE_SELF',
        'You cannot remove your own super admin access',
      );

    const roles = input.adminRole
      ? [...new Set([...profile.roles, 'admin'])]
      : profile.roles.filter((r) => r !== 'admin');
    await this.db.transaction().execute(async (tx) => {
      await tx
        .updateTable('profiles')
        .set({ roles, admin_role: input.adminRole as AdminRole | null })
        .where('id', '=', profile.id)
        .execute();
      await this.audit.record(tx, {
        actorId,
        action: 'admin.grant',
        entityType: 'user',
        entityId: profile.id,
        before: { adminRole: profile.admin_role },
        after: { adminRole: input.adminRole },
      });
    });
    return { userId: profile.id, adminRole: input.adminRole };
  }
}

export function toAdminRestaurant(r: Restaurant): AdminRestaurantDto {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    isOpen: r.is_open,
    cuisines: r.cuisines,
    addressLine: r.address_line,
    phone: r.phone,
    cityId: r.city_id,
    zoneId: r.zone_id,
    lat: r.lat,
    lng: r.lng,
    ratingAvg: Math.round(r.rating_avg * 10) / 10,
    ratingCount: r.rating_count,
    commissionBps: r.commission_bps,
    deliveryRadiusM: r.delivery_radius_m,
    fssaiLicense: r.fssai_license,
    gstin: r.gstin,
    lastHeartbeatAt: iso(r.last_heartbeat_at),
    createdAt: r.created_at.toISOString(),
  };
}

type RiderRow = Awaited<
  ReturnType<ReturnType<AdminAccountsService['ridersQuery']>['executeTakeFirstOrThrow']>
>;

function toAdminRider(r: RiderRow): AdminRiderDto {
  return {
    id: r.id,
    name: r.full_name,
    phone: r.phone,
    vehicleType: r.vehicle_type,
    vehicleNumber: r.vehicle_number,
    licenseNumber: r.license_number,
    kycStatus: r.kyc_status,
    isOnline: r.is_online,
    currentOrderId: r.current_order_id,
    cashInHandPaise: r.cash_in_hand_paise,
    cashLimitPaise: r.cash_limit_paise,
    ratingAvg: Math.round(r.rating_avg * 10) / 10,
    acceptanceRate: r.offers_received
      ? Math.round((r.offers_accepted / r.offers_received) * 100) / 100
      : 1,
    flagsCount: r.flags_count,
    lastSeenAt: iso(r.last_seen_at),
    createdAt: r.created_at.toISOString(),
  };
}
