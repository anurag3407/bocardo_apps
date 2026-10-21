import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CursorQuery } from '../../common/http/schemas';
import {
  DeliveryAddressSchema,
  DispatchStatusSchema,
  OrderStatusSchema,
} from '../orders/orders.dto';

export class RiderApplyDto extends createZodDto(
  z.object({
    fullName: z.string().trim().min(2).max(80),
    vehicleType: z.enum(['bicycle', 'scooter', 'motorcycle', 'ev']),
    vehicleNumber: z.string().trim().max(20).optional(),
    licenseNumber: z.string().trim().max(30).optional(),
  }),
) {}

export const RiderProfileSchema = z
  .object({
    id: z.string(),
    fullName: z.string().nullable(),
    phone: z.string().nullable(),
    kycStatus: z.enum(['pending', 'approved', 'rejected', 'suspended']),
    vehicleType: z.enum(['bicycle', 'scooter', 'motorcycle', 'ev']),
    vehicleNumber: z.string().nullable(),
    isOnline: z.boolean(),
    currentOrderId: z.string().nullable(),
    cashInHandPaise: z.number().int(),
    cashLimitPaise: z.number().int(),
    ratingAvg: z.number(),
    acceptanceRate: z.number(),
  })
  .meta({ id: 'RiderProfile' });

export class RiderProfileDto extends createZodDto(RiderProfileSchema.clone()) {}

export class GoOnlineDto extends createZodDto(
  z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
) {}

const LocationPoint = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().nonnegative().optional(),
  speedMps: z.number().optional(),
  heading: z.number().optional(),
  isMock: z.boolean().default(false),
  recordedAt: z.iso.datetime(),
});

/** Batched so points queued while offline are replayed in one call. */
export class LocationBatchDto extends createZodDto(
  z.object({ points: z.array(LocationPoint).min(1).max(100) }),
) {}
export class LocationAckDto extends createZodDto(
  z.object({ accepted: z.number().int(), rejected: z.number().int() }),
) {}

export const RiderOfferSchema = z
  .object({
    offerId: z.string(),
    orderId: z.string(),
    shortCode: z.string(),
    restaurantName: z.string(),
    restaurantAddress: z.string(),
    pickup: z.object({ lat: z.number(), lng: z.number() }),
    drop: z.object({ lat: z.number(), lng: z.number() }),
    pickupDistanceM: z.number().int(),
    tripDistanceM: z.number().int(),
    payoutPaise: z.number().int(),
    isCod: z.boolean(),
    collectPaise: z.number().int(),
    expiresAt: z.string(),
  })
  .meta({ id: 'RiderOffer' });

export class CurrentOfferDto extends createZodDto(
  z.object({ offer: RiderOfferSchema.nullable() }),
) {}
export class RejectOfferDto extends createZodDto(
  z.object({ reason: z.string().max(200).optional() }),
) {}

export const RiderOrderSchema = z
  .object({
    id: z.string(),
    shortCode: z.string(),
    status: OrderStatusSchema,
    dispatchStatus: DispatchStatusSchema,
    restaurant: z.object({
      id: z.string(),
      name: z.string(),
      phone: z.string().nullable(),
      addressLine: z.string(),
      lat: z.number(),
      lng: z.number(),
    }),
    customer: z.object({ name: z.string().nullable(), phone: z.string().nullable() }),
    dropAddress: DeliveryAddressSchema,
    items: z.array(
      z.object({
        name: z.string(),
        variantName: z.string().nullable(),
        quantity: z.number().int(),
      }),
    ),
    paymentMethod: z.enum(['cod', 'online']),
    collectPaise: z.number().int(),
    payoutPaise: z.number().int(),
    customerNote: z.string().nullable(),
    readyAt: z.string().nullable(),
    estimatedDeliveryAt: z.string().nullable(),
    createdAt: z.string(),
    deliveredAt: z.string().nullable(),
  })
  .meta({ id: 'RiderOrder' });

export class RiderOrderDto extends createZodDto(RiderOrderSchema.clone()) {}
export class ActiveRiderOrderDto extends createZodDto(
  z.object({ order: RiderOrderSchema.nullable() }),
) {}
export class RiderOrderPageDto extends createZodDto(
  z.object({ items: z.array(RiderOrderSchema), nextCursor: z.string().nullable() }),
) {}
export class RiderHistoryQueryDto extends createZodDto(CursorQuery) {}

export class DeliverDto extends createZodDto(z.object({ otp: z.string().regex(/^\d{4}$/) })) {}
export class UndeliverableDto extends createZodDto(
  z.object({ reason: z.string().trim().min(3).max(300) }),
) {}
export class SosDto extends createZodDto(
  z.object({
    lat: z.number(),
    lng: z.number(),
    orderId: z.uuid().optional(),
    note: z.string().max(300).optional(),
  }),
) {}
