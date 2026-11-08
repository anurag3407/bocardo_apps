import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { MenuCategorySchema } from '../catalog/catalog.dto';
import { DispatchStatusSchema, OrderLineSchema, OrderStatusSchema } from '../orders/orders.dto';

const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM');

export const FssaiRegex = /^\d{14}$/;
export const PanRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
export const GstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
export const IfscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export class RestaurantApplyDto extends createZodDto(
  z.object({
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(500).optional(),
    cuisines: z.array(z.string().trim().min(2).max(30)).min(1).max(8),
    phone: z.string().trim().min(10).max(15),
    email: z.email().optional(),
    addressLine: z.string().trim().min(5).max(200),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    // Owner / primary contact
    ownerName: z.string().trim().min(2).max(80),
    ownerPhone: z.string().trim().min(10).max(15).optional(),
    ownerEmail: z.email().optional(),
    // Regulatory compliance (FSSAI)
    fssaiLicense: z.string().trim().regex(FssaiRegex, 'FSSAI license must be exactly 14 digits'),
    fssaiExpiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'FSSAI expiry date must be YYYY-MM-DD'),
    fssaiDocumentPath: z.string().trim().min(3),
    // Business entity & Tax (PAN & GSTIN)
    legalEntityName: z.string().trim().min(2).max(120),
    panNumber: z.string().trim().toUpperCase().regex(PanRegex, 'Invalid PAN format (e.g. ABCDE1234F)'),
    panDocumentPath: z.string().trim().min(3),
    gstin: z.string().trim().toUpperCase().regex(GstinRegex, 'Invalid GSTIN format').optional(),
    gstDocumentPath: z.string().trim().optional(),
    // Bank details for settlements
    bankAccountNumber: z.string().trim().min(8).max(30),
    bankIfsc: z.string().trim().toUpperCase().regex(IfscRegex, 'Invalid IFSC code (e.g. HDFC0001234)'),
    bankBeneficiaryName: z.string().trim().min(2).max(120),
    bankName: z.string().trim().min(2).max(100),
    bankChequeDocumentPath: z.string().trim().optional(),
    // Operational defaults
    costForTwoPaise: z.number().int().positive().optional(),
    isVegOnly: z.boolean().optional(),
    avgPrepMinutes: z.number().int().min(5).max(120).optional(),
  }),
) {}

export class RestaurantResubmitDto extends createZodDto(
  z.object({
    name: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(500).optional(),
    cuisines: z.array(z.string().trim().min(2).max(30)).min(1).max(8).optional(),
    phone: z.string().trim().min(10).max(15).optional(),
    email: z.email().optional(),
    addressLine: z.string().trim().min(5).max(200).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    ownerName: z.string().trim().min(2).max(80).optional(),
    ownerPhone: z.string().trim().min(10).max(15).optional(),
    ownerEmail: z.email().optional(),
    fssaiLicense: z.string().trim().regex(FssaiRegex, 'FSSAI license must be exactly 14 digits').optional(),
    fssaiExpiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'FSSAI expiry date must be YYYY-MM-DD').optional(),
    fssaiDocumentPath: z.string().trim().min(3).optional(),
    legalEntityName: z.string().trim().min(2).max(120).optional(),
    panNumber: z.string().trim().toUpperCase().regex(PanRegex, 'Invalid PAN format').optional(),
    panDocumentPath: z.string().trim().min(3).optional(),
    gstin: z.string().trim().toUpperCase().regex(GstinRegex, 'Invalid GSTIN format').optional(),
    gstDocumentPath: z.string().trim().optional(),
    bankAccountNumber: z.string().trim().min(8).max(30).optional(),
    bankIfsc: z.string().trim().toUpperCase().regex(IfscRegex, 'Invalid IFSC code').optional(),
    bankBeneficiaryName: z.string().trim().min(2).max(120).optional(),
    bankName: z.string().trim().min(2).max(100).optional(),
    bankChequeDocumentPath: z.string().trim().optional(),
    costForTwoPaise: z.number().int().positive().optional(),
    isVegOnly: z.boolean().optional(),
    avgPrepMinutes: z.number().int().min(5).max(120).optional(),
  }),
) {}

export const PartnerRestaurantSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    cuisines: z.array(z.string()),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    addressLine: z.string(),
    coverImageUrl: z.string().nullable(),
    logoUrl: z.string().nullable(),
    lat: z.number(),
    lng: z.number(),
    status: z.enum(['pending', 'active', 'suspended', 'rejected']),
    isOpen: z.boolean(),
    busyUntil: z.string().nullable(),
    avgPrepMinutes: z.number().int(),
    minOrderPaise: z.number().int(),
    packagingFeePaise: z.number().int(),
    costForTwoPaise: z.number().int().nullable(),
    isVegOnly: z.boolean(),
    ratingAvg: z.number(),
    ratingCount: z.number().int(),
    deliveryRadiusM: z.number().int(),
    commissionBps: z.number().int(),
    memberRole: z.enum(['owner', 'manager', 'staff']),
    ownerName: z.string().nullable(),
    ownerPhone: z.string().nullable(),
    ownerEmail: z.string().nullable(),
    fssaiLicense: z.string().nullable(),
    fssaiExpiryDate: z.string().nullable(),
    fssaiDocumentPath: z.string().nullable(),
    panNumber: z.string().nullable(),
    panDocumentPath: z.string().nullable(),
    gstin: z.string().nullable(),
    gstDocumentPath: z.string().nullable(),
    legalEntityName: z.string().nullable(),
    bankAccountNumber: z.string().nullable(),
    bankIfsc: z.string().nullable(),
    bankBeneficiaryName: z.string().nullable(),
    bankName: z.string().nullable(),
    bankChequeDocumentPath: z.string().nullable(),
    rejectionReason: z.string().nullable(),
    verifiedAt: z.string().nullable(),
    hours: z.array(
      z.object({ dayOfWeek: z.number().int(), opensAt: z.string(), closesAt: z.string() }),
    ),
  })
  .meta({ id: 'PartnerRestaurant' });

export class PartnerRestaurantDto extends createZodDto(PartnerRestaurantSchema.clone()) {}
export class PartnerRestaurantListDto extends createZodDto(z.array(PartnerRestaurantSchema)) {}

export class UpdateRestaurantDto extends createZodDto(
  z.object({
    description: z.string().trim().max(500).nullish(),
    phone: z.string().trim().min(10).max(15).optional(),
    email: z.email().nullish(),
    coverImageUrl: z.url().nullish(),
    logoUrl: z.url().nullish(),
    avgPrepMinutes: z.number().int().min(5).max(120).optional(),
    minOrderPaise: z.number().int().min(0).max(500_000).optional(),
    packagingFeePaise: z.number().int().min(0).max(10_000).optional(),
    costForTwoPaise: z.number().int().min(0).nullish(),
    isVegOnly: z.boolean().optional(),
  }),
) {}

export class SetOpenDto extends createZodDto(z.object({ isOpen: z.boolean() })) {}
export class SetBusyDto extends createZodDto(
  z.object({ minutes: z.number().int().min(0).max(240).describe('0 clears busy mode') }),
) {}
export class SetHoursDto extends createZodDto(
  z.object({
    hours: z
      .array(z.object({ dayOfWeek: z.number().int().min(0).max(6), opensAt: Time, closesAt: Time }))
      .max(28),
  }),
) {}

// ── Menu management ────────────────────────────────────────────────────────
export class PartnerMenuDto extends createZodDto(
  z.object({ categories: z.array(MenuCategorySchema) }),
) {}

export class CreateCategoryDto extends createZodDto(
  z.object({ name: z.string().trim().min(1).max(60), sortOrder: z.number().int().default(0) }),
) {}
export class UpdateCategoryDto extends createZodDto(
  z.object({
    name: z.string().trim().min(1).max(60).optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
  }),
) {}

const ItemFields = z.object({
  categoryId: z.uuid(),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullish(),
  imageUrl: z.url().nullish(),
  pricePaise: z.number().int().min(0).max(1_000_000),
  isVeg: z.boolean(),
  isBestseller: z.boolean().default(false),
  maxPerOrder: z.number().int().min(1).max(100).default(10),
  sortOrder: z.number().int().default(0),
});
export class CreateItemDto extends createZodDto(ItemFields) {}
export class UpdateItemDto extends createZodDto(
  ItemFields.partial().extend({ isActive: z.boolean().optional() }),
) {}

export class ItemOptionsDto extends createZodDto(
  z.object({
    variants: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(40),
          pricePaise: z.number().int().min(0),
          isDefault: z.boolean().default(false),
          inStock: z.boolean().default(true),
        }),
      )
      .max(10),
    addonGroups: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(60),
          minSelect: z.number().int().min(0).max(10),
          maxSelect: z.number().int().min(1).max(20),
          addons: z
            .array(
              z.object({
                name: z.string().trim().min(1).max(60),
                pricePaise: z.number().int().min(0),
                isVeg: z.boolean().default(true),
                inStock: z.boolean().default(true),
              }),
            )
            .min(1)
            .max(30),
        }),
      )
      .max(10),
  }),
) {}

export class SetStockDto extends createZodDto(
  z.object({ type: z.enum(['item', 'variant', 'addon']), id: z.uuid(), inStock: z.boolean() }),
) {}

// ── Orders ─────────────────────────────────────────────────────────────────
export const PartnerOrderSchema = z
  .object({
    id: z.string(),
    shortCode: z.string(),
    status: OrderStatusSchema,
    dispatchStatus: DispatchStatusSchema,
    customerName: z.string(),
    items: z.array(OrderLineSchema),
    customerNote: z.string().nullable(),
    itemTotalPaise: z.number().int(),
    totalPaise: z.number().int(),
    paymentMethod: z.enum(['cod', 'online']),
    prepMinutes: z.number().int().nullable(),
    acceptBy: z.string().nullable(),
    rider: z
      .object({
        name: z.string().nullable(),
        vehicleNumber: z.string().nullable(),
      })
      .nullable(),
    placedAt: z.string().nullable(),
    acceptedAt: z.string().nullable(),
    readyAt: z.string().nullable(),
    pickedUpAt: z.string().nullable(),
    cancelReason: z.string().nullable(),
    createdAt: z.string(),
  })
  .meta({ id: 'PartnerOrder' });

export class PartnerOrderDto extends createZodDto(PartnerOrderSchema.clone()) {}
export class PartnerOrderListDto extends createZodDto(
  z.object({ items: z.array(PartnerOrderSchema), nextCursor: z.string().nullable() }),
) {}
export class PartnerOrdersQueryDto extends createZodDto(
  z.object({
    scope: z.enum(['active', 'history']).default('active'),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(30),
  }),
) {}

export class AcceptOrderDto extends createZodDto(
  z.object({ prepMinutes: z.number().int().min(5).max(120) }),
) {}
export class RejectOrderDto extends createZodDto(
  z.object({
    reason: z.enum(['ITEMS_UNAVAILABLE', 'TOO_BUSY', 'CLOSING_SOON', 'OTHER']),
    note: z.string().max(200).optional(),
  }),
) {}
export class ExtendPrepDto extends createZodDto(
  z.object({ extraMinutes: z.number().int().min(5).max(60) }),
) {}
export class PartnerCancelDto extends createZodDto(
  z.object({ reason: z.string().trim().min(3).max(300) }),
) {}
