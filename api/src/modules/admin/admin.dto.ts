import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CouponSchema } from '../promotions/coupons.controller';
import {
  CustomerOrderSchema,
  DispatchStatusSchema,
  OrderStatusSchema,
  OrderSummarySchema,
} from '../orders/orders.dto';

const Page = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });
const CursorFields = {
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
};

// ── Overview & live ops ────────────────────────────────────────────────────
export class CityQueryDto extends createZodDto(z.object({ cityId: z.uuid().optional() })) {}

export class OverviewDto extends createZodDto(
  z.object({
    activeByStatus: z.record(z.string(), z.number().int()),
    ordersToday: z.number().int(),
    deliveredToday: z.number().int(),
    cancelledToday: z.number().int(),
    gmvTodayPaise: z.number().int(),
    avgDeliveryMinutesToday: z.number().nullable(),
    ridersOnline: z.number().int(),
    ridersBusy: z.number().int(),
    restaurantsOpen: z.number().int(),
    dispatchFailed: z.number().int(),
    pendingRestaurants: z.number().int(),
    pendingRiders: z.number().int(),
    openTickets: z.number().int(),
    /** SMS fraud monitoring: OTPs actually sent vs requests blocked for lacking a verified ticket. */
    otpSentLastHour: z.number().int(),
    otpBlockedLastHour: z.number().int(),
  }),
) {}

export class LiveMapDto extends createZodDto(
  z.object({
    orders: z.array(
      z.object({
        id: z.string(),
        shortCode: z.string(),
        status: OrderStatusSchema,
        dispatchStatus: DispatchStatusSchema,
        pickup: z.object({ lat: z.number(), lng: z.number() }),
        drop: z.object({ lat: z.number(), lng: z.number() }),
        riderId: z.string().nullable(),
        createdAt: z.string(),
      }),
    ),
    riders: z.array(
      z.object({
        id: z.string(),
        name: z.string().nullable(),
        lat: z.number(),
        lng: z.number(),
        busy: z.boolean(),
        lastSeenAt: z.string().nullable(),
      }),
    ),
  }),
) {}

// ── Orders ─────────────────────────────────────────────────────────────────
export class AdminOrdersQueryDto extends createZodDto(
  z.object({
    ...CursorFields,
    status: z
      .enum(['active', 'all', 'delivered', 'cancelled', 'failed_dispatch'])
      .default('active'),
    q: z.string().trim().max(40).optional().describe('Order code or customer phone'),
    restaurantId: z.uuid().optional(),
    riderId: z.uuid().optional(),
    cityId: z.uuid().optional(),
  }),
) {}

export const AdminOrderRowSchema = OrderSummarySchema.extend({
  customerName: z.string().nullable(),
  customerPhone: z.string().nullable(),
  riderName: z.string().nullable(),
}).meta({ id: 'AdminOrderRow' });

export class AdminOrderPageDto extends createZodDto(Page(AdminOrderRowSchema)) {}

export class AdminOrderDetailDto extends createZodDto(
  CustomerOrderSchema.extend({
    customer: z.object({
      id: z.string(),
      name: z.string().nullable(),
      phone: z.string().nullable(),
    }),
    events: z.array(
      z.object({
        id: z.number().int(),
        event: z.string(),
        actorType: z.string(),
        actorId: z.string().nullable(),
        metadata: z.record(z.string(), z.unknown()),
        at: z.string(),
      }),
    ),
    payments: z.array(
      z.object({
        id: z.string(),
        provider: z.string(),
        providerOrderId: z.string(),
        providerPaymentId: z.string().nullable(),
        amountPaise: z.number().int(),
        refundedPaise: z.number().int(),
        status: z.string(),
        createdAt: z.string(),
      }),
    ),
    refunds: z.array(
      z.object({
        id: z.string(),
        amountPaise: z.number().int(),
        status: z.string(),
        reason: z.string(),
        attempts: z.number().int(),
        lastError: z.string().nullable(),
        createdAt: z.string(),
      }),
    ),
    offers: z.array(
      z.object({
        id: z.string(),
        riderId: z.string(),
        riderName: z.string().nullable(),
        status: z.string(),
        score: z.number(),
        distanceM: z.number().int(),
        payoutPaise: z.number().int(),
        createdAt: z.string(),
      }),
    ),
    calls: z.array(
      z.object({
        id: z.string(),
        callerRole: z.string(),
        calleeRole: z.string(),
        provider: z.string(),
        status: z.string(),
        durationSeconds: z.number().int().nullable(),
        createdAt: z.string(),
      }),
    ),
    deliveryProofLat: z.number().nullable(),
    deliveryProofLng: z.number().nullable(),
  }),
) {}

export class AdminCancelDto extends createZodDto(
  z.object({ reason: z.string().trim().min(3).max(300) }),
) {}
export class AdminRefundDto extends createZodDto(
  z.object({ amountPaise: z.number().int().positive(), reason: z.string().trim().min(3).max(300) }),
) {}
export class ReassignDto extends createZodDto(
  z.object({ reason: z.string().trim().min(3).max(300) }),
) {}

// ── Accounts ───────────────────────────────────────────────────────────────
export class AdminRestaurantsQueryDto extends createZodDto(
  z.object({
    ...CursorFields,
    status: z.enum(['pending', 'active', 'suspended', 'rejected']).optional(),
    q: z.string().trim().max(60).optional(),
  }),
) {}

export const AdminRestaurantSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    status: z.enum(['pending', 'active', 'suspended', 'rejected']),
    isOpen: z.boolean(),
    cuisines: z.array(z.string()),
    addressLine: z.string(),
    phone: z.string().nullable(),
    cityId: z.string(),
    zoneId: z.string().nullable(),
    lat: z.number(),
    lng: z.number(),
    ratingAvg: z.number(),
    ratingCount: z.number().int(),
    commissionBps: z.number().int(),
    deliveryRadiusM: z.number().int(),
    fssaiLicense: z.string().nullable(),
    gstin: z.string().nullable(),
    lastHeartbeatAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .meta({ id: 'AdminRestaurant' });

export class AdminRestaurantPageDto extends createZodDto(Page(AdminRestaurantSchema)) {}
export class AdminRestaurantDto extends createZodDto(AdminRestaurantSchema.clone()) {}
export class RestaurantStatusDto extends createZodDto(
  z.object({
    status: z.enum(['active', 'suspended', 'rejected']),
    reason: z.string().max(300).optional(),
  }),
) {}
export class RestaurantTermsDto extends createZodDto(
  z.object({
    commissionBps: z.number().int().min(0).max(5000).optional(),
    deliveryRadiusM: z.number().int().min(500).max(20000).optional(),
  }),
) {}

export class AdminRidersQueryDto extends createZodDto(
  z.object({
    ...CursorFields,
    kycStatus: z.enum(['pending', 'approved', 'rejected', 'suspended']).optional(),
    online: z.coerce.boolean().optional(),
    q: z.string().trim().max(40).optional(),
  }),
) {}

export const AdminRiderSchema = z
  .object({
    id: z.string(),
    name: z.string().nullable(),
    phone: z.string().nullable(),
    vehicleType: z.string(),
    vehicleNumber: z.string().nullable(),
    licenseNumber: z.string().nullable(),
    kycStatus: z.enum(['pending', 'approved', 'rejected', 'suspended']),
    isOnline: z.boolean(),
    currentOrderId: z.string().nullable(),
    cashInHandPaise: z.number().int(),
    cashLimitPaise: z.number().int(),
    ratingAvg: z.number(),
    acceptanceRate: z.number(),
    flagsCount: z.number().int(),
    lastSeenAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .meta({ id: 'AdminRider' });

export class AdminRiderPageDto extends createZodDto(Page(AdminRiderSchema)) {}
export class AdminRiderDto extends createZodDto(AdminRiderSchema.clone()) {}
export class RiderKycDto extends createZodDto(
  z.object({
    status: z.enum(['approved', 'rejected', 'suspended']),
    reason: z.string().max(300).optional(),
  }),
) {}
export class CashDepositDto extends createZodDto(
  z.object({ amountPaise: z.number().int().positive() }),
) {}

export class AdminUsersQueryDto extends createZodDto(
  z.object({ ...CursorFields, q: z.string().trim().max(60).optional() }),
) {}
export const AdminUserSchema = z
  .object({
    id: z.string(),
    fullName: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    roles: z.array(z.string()),
    adminRole: z.string().nullable(),
    isBlocked: z.boolean(),
    orderCount: z.number().int(),
    createdAt: z.string(),
  })
  .meta({ id: 'AdminUser' });
export class AdminUserPageDto extends createZodDto(Page(AdminUserSchema)) {}
export class BlockUserDto extends createZodDto(
  z.object({ blocked: z.boolean(), reason: z.string().max(300).optional() }),
) {}
export class GrantAdminDto extends createZodDto(
  z.object({
    email: z.email().optional(),
    phone: z.string().optional(),
    adminRole: z.enum(['super_admin', 'ops', 'support', 'finance']).nullable(),
  }),
) {}

// ── Geography ──────────────────────────────────────────────────────────────
export const GeoJsonPolygon = z
  .object({
    type: z.literal('Polygon'),
    coordinates: z
      .array(z.array(z.array(z.number()).length(2)).min(4))
      .min(1)
      .describe('[lng, lat] rings; first ring is the boundary, closed'),
  })
  .meta({ id: 'GeoJsonPolygon' });

export const CitySchema = z
  .object({ id: z.string(), name: z.string(), timezone: z.string(), isActive: z.boolean() })
  .meta({ id: 'City' });
export class CityListDto extends createZodDto(z.array(CitySchema)) {}
export class CreateCityDto extends createZodDto(
  z.object({
    name: z.string().trim().min(2).max(60),
    timezone: z.string().default('Asia/Kolkata'),
  }),
) {}

const ZoneFields = z.object({
  name: z.string().trim().min(2).max(60),
  boundary: GeoJsonPolygon,
  isActive: z.boolean().default(true),
  deliveryBaseFeePaise: z.number().int().min(0).default(2500),
  deliveryBaseKm: z.number().min(0).max(20).default(2),
  deliveryPerKmPaise: z.number().int().min(0).default(800),
  platformFeePaise: z.number().int().min(0).default(500),
  freeDeliveryAbovePaise: z.number().int().min(0).nullable().default(null),
  surgeMultiplier: z.number().min(1).max(3).default(1),
  rainMode: z.boolean().default(false),
});
export class CreateZoneDto extends createZodDto(ZoneFields.extend({ cityId: z.uuid() })) {}
export class UpdateZoneDto extends createZodDto(ZoneFields.partial()) {}

export const ZoneSchema = z
  .object({
    id: z.string(),
    cityId: z.string(),
    name: z.string(),
    boundary: GeoJsonPolygon,
    isActive: z.boolean(),
    deliveryBaseFeePaise: z.number().int(),
    deliveryBaseKm: z.number(),
    deliveryPerKmPaise: z.number().int(),
    platformFeePaise: z.number().int(),
    freeDeliveryAbovePaise: z.number().int().nullable(),
    surgeMultiplier: z.number(),
    rainMode: z.boolean(),
  })
  .meta({ id: 'Zone' });
export class ZoneDto extends createZodDto(ZoneSchema.clone()) {}
export class ZoneListDto extends createZodDto(z.array(ZoneSchema)) {}

// ── Commerce ───────────────────────────────────────────────────────────────
const CouponFields = z.object({
  code: z
    .string()
    .trim()
    .min(3)
    .max(30)
    .transform((s) => s.toUpperCase()),
  description: z.string().max(200).nullish(),
  discountType: z.enum(['percent', 'flat']),
  discountValue: z.number().int().positive(),
  maxDiscountPaise: z.number().int().positive().nullish(),
  minOrderPaise: z.number().int().min(0).default(0),
  validFrom: z.iso.datetime().optional(),
  validUntil: z.iso.datetime().nullish(),
  maxUses: z.number().int().positive().nullish(),
  perUserLimit: z.number().int().min(1).default(1),
  firstOrderOnly: z.boolean().default(false),
  restaurantId: z.uuid().nullish(),
  isActive: z.boolean().default(true),
});
export class CreateCouponDto extends createZodDto(CouponFields) {}
export class UpdateCouponDto extends createZodDto(CouponFields.omit({ code: true }).partial()) {}
export const AdminCouponSchema = CouponSchema.extend({
  usedCount: z.number().int(),
  maxUses: z.number().int().nullable(),
  perUserLimit: z.number().int(),
  isActive: z.boolean(),
  validFrom: z.string(),
}).meta({ id: 'AdminCoupon' });
export class AdminCouponListDto extends createZodDto(z.array(AdminCouponSchema)) {}
export class AdminCouponDto extends createZodDto(AdminCouponSchema.clone()) {}

export const PayoutSchema = z
  .object({
    id: z.string(),
    accountType: z.enum(['restaurant', 'rider']),
    accountId: z.string(),
    accountName: z.string().nullable(),
    amountPaise: z.number().int(),
    status: z.enum(['pending', 'processing', 'paid', 'failed']),
    providerRef: z.string().nullable(),
    periodEnd: z.string(),
    createdAt: z.string(),
  })
  .meta({ id: 'Payout' });
export class PayoutPageDto extends createZodDto(Page(PayoutSchema)) {}
export class PayoutsQueryDto extends createZodDto(
  z.object({
    ...CursorFields,
    status: z.enum(['pending', 'processing', 'paid', 'failed']).optional(),
  }),
) {}
export class RunPayoutsResultDto extends createZodDto(z.object({ created: z.number().int() })) {}
export class MarkPaidDto extends createZodDto(
  z.object({ providerRef: z.string().trim().min(3).max(100) }),
) {}

export class TicketsQueryDto extends createZodDto(
  z.object({
    ...CursorFields,
    status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  }),
) {}
export class UpdateTicketDto extends createZodDto(
  z.object({
    status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
    resolution: z.string().trim().max(2000).optional(),
    assignToMe: z.boolean().optional(),
    refundPaise: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Issues a refund on the linked order'),
  }),
) {}

export class AuditQueryDto extends createZodDto(
  z.object({ ...CursorFields, entityType: z.string().optional(), entityId: z.string().optional() }),
) {}
export const AuditLogSchema = z
  .object({
    id: z.number().int(),
    actorId: z.string().nullable(),
    actorName: z.string().nullable(),
    action: z.string(),
    entityType: z.string(),
    entityId: z.string().nullable(),
    before: z.unknown(),
    after: z.unknown(),
    createdAt: z.string(),
  })
  .meta({ id: 'AuditLog' });
export class AuditPageDto extends createZodDto(Page(AuditLogSchema)) {}

export class AppConfigEntryDto extends createZodDto(
  z.object({ key: z.string(), value: z.unknown(), updatedAt: z.string() }),
) {}
export class AppConfigListDto extends createZodDto(
  z.array(z.object({ key: z.string(), value: z.unknown(), updatedAt: z.string() })),
) {}
export class SetAppConfigDto extends createZodDto(z.object({ value: z.unknown() })) {}
