import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CursorQuery } from '../../common/http/schemas';
import { MAX_CART_LINES } from './domain/cart-validation';

export const ORDER_STATUSES = [
  'PAYMENT_PENDING',
  'PAYMENT_FAILED',
  'PLACED',
  'ACCEPTED',
  'READY',
  'PICKED_UP',
  'DELIVERED',
  'REJECTED',
  'CANCELLED',
  'UNDELIVERED',
] as const;
export const DISPATCH_STATUSES = [
  'UNASSIGNED',
  'SEARCHING',
  'ASSIGNED',
  'AT_RESTAURANT',
  'PICKED',
  'AT_DROP',
  'DONE',
  'FAILED',
] as const;

export const OrderStatusSchema = z.enum(ORDER_STATUSES).meta({ id: 'OrderStatus' });
export const DispatchStatusSchema = z.enum(DISPATCH_STATUSES).meta({ id: 'DispatchStatus' });

// ── Requests ────────────────────────────────────────────────────────────────
const CartLine = z.object({
  menuItemId: z.uuid(),
  variantId: z.uuid().nullish(),
  addonIds: z.array(z.uuid()).max(20).default([]),
  quantity: z.number().int().min(1).max(50),
  expectedUnitPricePaise: z.number().int().nonnegative().optional(),
});

export class QuoteRequestDto extends createZodDto(
  z.object({
    restaurantId: z.uuid(),
    addressId: z.uuid(),
    items: z.array(CartLine).min(1).max(MAX_CART_LINES),
    couponCode: z.string().trim().max(30).optional(),
    tipPaise: z.number().int().min(0).max(50_000).default(0),
  }),
) {}

export class PlaceOrderDto extends createZodDto(
  z.object({
    quoteId: z.uuid(),
    paymentMethod: z.enum(['cod', 'online']),
    customerNote: z.string().trim().max(300).optional(),
  }),
) {}

export class CancelOrderDto extends createZodDto(
  z.object({ reason: z.string().trim().min(3).max(300) }),
) {}

export class OrdersQueryDto extends createZodDto(CursorQuery) {}

// ── Responses ───────────────────────────────────────────────────────────────
export const PriceBreakdownSchema = z
  .object({
    itemTotalPaise: z.number().int(),
    packagingFeePaise: z.number().int(),
    deliveryFeePaise: z.number().int(),
    deliveryFeeWaivedPaise: z.number().int(),
    rainSurchargePaise: z.number().int(),
    platformFeePaise: z.number().int(),
    discountPaise: z.number().int(),
    taxPaise: z.number().int(),
    tipPaise: z.number().int(),
    totalPaise: z.number().int(),
    surgeMultiplier: z.number(),
    couponCode: z.string().nullable(),
  })
  .meta({ id: 'PriceBreakdown' });

export const OrderLineSchema = z
  .object({
    menuItemId: z.string().nullable(),
    name: z.string(),
    variantName: z.string().nullable(),
    addons: z.array(z.object({ id: z.string(), name: z.string(), pricePaise: z.number().int() })),
    isVeg: z.boolean(),
    unitPricePaise: z.number().int(),
    quantity: z.number().int(),
    lineTotalPaise: z.number().int(),
  })
  .meta({ id: 'OrderLine' });

export const DeliveryAddressSchema = z
  .object({
    label: z.string(),
    line1: z.string(),
    line2: z.string().nullable(),
    landmark: z.string().nullable(),
    city: z.string().nullable(),
    pincode: z.string().nullable(),
    lat: z.number(),
    lng: z.number(),
    contactName: z.string().nullable(),
    contactPhone: z.string().nullable(),
  })
  .meta({ id: 'DeliveryAddress' });

export class QuoteDto extends createZodDto(
  z.object({
    quoteId: z.string(),
    expiresAt: z.string(),
    restaurant: z.object({ id: z.string(), name: z.string() }),
    deliveryAddress: DeliveryAddressSchema,
    lines: z.array(OrderLineSchema),
    pricing: PriceBreakdownSchema,
    couponError: z.object({ code: z.string(), message: z.string() }).nullable(),
    warnings: z.array(
      z.object({
        lineIndex: z.number().int(),
        code: z.string(),
        message: z.string(),
        previousPaise: z.number().int(),
        currentPaise: z.number().int(),
      }),
    ),
    etaMinutes: z.number().int(),
    distanceM: z.number().int(),
    codAvailable: z.boolean(),
  }),
) {}

export const PaymentSessionSchema = z
  .object({
    provider: z.enum(['razorpay', 'mock']),
    providerOrderId: z.string(),
    amountPaise: z.number().int(),
    currency: z.literal('INR'),
    publicKey: z.string(),
  })
  .meta({ id: 'PaymentSession' });

export const OrderSummarySchema = z
  .object({
    id: z.string(),
    shortCode: z.string(),
    status: OrderStatusSchema,
    dispatchStatus: DispatchStatusSchema,
    restaurant: z.object({ id: z.string(), name: z.string(), logoUrl: z.string().nullable() }),
    itemCount: z.number().int(),
    itemsPreview: z.string(),
    totalPaise: z.number().int(),
    paymentMethod: z.enum(['cod', 'online']),
    createdAt: z.string(),
    deliveredAt: z.string().nullable(),
  })
  .meta({ id: 'OrderSummary' });

export class OrderPageDto extends createZodDto(
  z.object({ items: z.array(OrderSummarySchema), nextCursor: z.string().nullable() }),
) {}

export const TimelineEntrySchema = z
  .object({ event: z.string(), status: OrderStatusSchema.nullable(), at: z.string() })
  .meta({ id: 'TimelineEntry' });

export const RiderInfoSchema = z
  .object({
    id: z.string(),
    name: z.string().nullable(),
    vehicleType: z.string(),
    vehicleNumber: z.string().nullable(),
    ratingAvg: z.number(),
    lat: z.number().nullable(),
    lng: z.number().nullable(),
    lastSeenAt: z.string().nullable(),
  })
  .meta({ id: 'RiderInfo' });

export const CustomerOrderSchema = z
  .object({
    id: z.string(),
    shortCode: z.string(),
    status: OrderStatusSchema,
    dispatchStatus: DispatchStatusSchema,
    paymentMethod: z.enum(['cod', 'online']),
    paymentStatus: z.enum(['pending', 'captured', 'failed', 'refunded', 'partially_refunded']),
    restaurant: z.object({
      id: z.string(),
      name: z.string(),
      phone: z.string().nullable(),
      addressLine: z.string(),
      lat: z.number(),
      lng: z.number(),
      logoUrl: z.string().nullable(),
    }),
    deliveryAddress: DeliveryAddressSchema,
    items: z.array(OrderLineSchema),
    pricing: PriceBreakdownSchema,
    rider: RiderInfoSchema.nullable(),
    deliveryOtp: z.string().nullable(),
    /** Signed, short-lived URL of the rider's doorstep photo (after delivery). */
    deliveryProofUrl: z.string().nullable(),
    prepMinutes: z.number().int().nullable(),
    estimatedDeliveryAt: z.string().nullable(),
    customerNote: z.string().nullable(),
    cancelReason: z.string().nullable(),
    cancelledBy: z.string().nullable(),
    canCancel: z.boolean(),
    canRate: z.boolean(),
    timeline: z.array(TimelineEntrySchema),
    createdAt: z.string(),
    deliveredAt: z.string().nullable(),
  })
  .meta({ id: 'CustomerOrder' });

export class CustomerOrderDto extends createZodDto(CustomerOrderSchema.clone()) {}

export class PlaceOrderResultDto extends createZodDto(
  z.object({ order: CustomerOrderSchema, payment: PaymentSessionSchema.nullable() }),
) {}

export class OrderTrackingDto extends createZodDto(
  z.object({
    status: OrderStatusSchema,
    dispatchStatus: DispatchStatusSchema,
    estimatedDeliveryAt: z.string().nullable(),
    rider: z
      .object({ lat: z.number(), lng: z.number(), heading: z.number().nullable(), at: z.string() })
      .nullable(),
  }),
) {}
