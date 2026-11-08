import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CursorQuery } from '../../common/http/schemas';
import {
  DeliveryAddressSchema,
  DispatchStatusSchema,
  OrderStatusSchema,
} from '../orders/orders.dto';

export const AadhaarRegex = /^\d{12}$/;
export const PanRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
export const IfscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const VehicleNumberRegex = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/i;
export const DlRegex = /^[A-Z]{2}[-0-9A-Z\s]{8,18}$/i;

export class RiderApplyDto extends createZodDto(
  z.object({
    fullName: z.string().trim().min(2).max(80),
    dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'DOB must be YYYY-MM-DD'),
    gender: z.enum(['male', 'female', 'other']).optional(),
    currentAddress: z.string().trim().min(5).max(250),
    // Emergency contact
    emergencyContactName: z.string().trim().min(2).max(80),
    emergencyContactPhone: z.string().trim().min(10).max(15),
    emergencyContactRelation: z.string().trim().min(2).max(40),
    // Vehicle & driving
    vehicleType: z.enum(['bicycle', 'scooter', 'motorcycle', 'ev']),
    vehicleNumber: z.string().trim().toUpperCase().regex(VehicleNumberRegex, 'Invalid vehicle number').optional(),
    licenseNumber: z.string().trim().toUpperCase().regex(DlRegex, 'Invalid driving licence number').optional(),
    licenseExpiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expiry must be YYYY-MM-DD').optional(),
    licenseFrontPath: z.string().trim().optional(),
    licenseBackPath: z.string().trim().optional(),
    rcDocumentPath: z.string().trim().optional(),
    insurancePolicyNumber: z.string().trim().optional(),
    insuranceExpiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expiry must be YYYY-MM-DD').optional(),
    // Identity verification
    aadhaarNumber: z.string().trim().regex(AadhaarRegex, 'Aadhaar must be 12 digits').optional(),
    aadhaarFrontPath: z.string().trim().optional(),
    aadhaarBackPath: z.string().trim().optional(),
    panNumber: z.string().trim().toUpperCase().regex(PanRegex, 'Invalid PAN format').optional(),
    panCardPath: z.string().trim().optional(),
    // Payout banking
    bankAccountNumber: z.string().trim().min(8).max(30),
    bankIfsc: z.string().trim().toUpperCase().regex(IfscRegex, 'Invalid IFSC code (e.g. HDFC0001234)'),
    bankBeneficiaryName: z.string().trim().min(2).max(120),
    bankName: z.string().trim().min(2).max(100),
    bankChequeDocumentPath: z.string().trim().optional(),
  }).superRefine((data, ctx) => {
    if (data.vehicleType !== 'bicycle') {
      if (!data.vehicleNumber) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Vehicle registration number is required for motorized vehicles',
          path: ['vehicleNumber'],
        });
      }
      if (!data.licenseNumber) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Driving licence number is required for motorized vehicles',
          path: ['licenseNumber'],
        });
      }
    }
  }),
) {}

export class RiderResubmitDto extends createZodDto(
  z.object({
    fullName: z.string().trim().min(2).max(80).optional(),
    dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'DOB must be YYYY-MM-DD').optional(),
    gender: z.enum(['male', 'female', 'other']).optional(),
    currentAddress: z.string().trim().min(5).max(250).optional(),
    emergencyContactName: z.string().trim().min(2).max(80).optional(),
    emergencyContactPhone: z.string().trim().min(10).max(15).optional(),
    emergencyContactRelation: z.string().trim().min(2).max(40).optional(),
    vehicleType: z.enum(['bicycle', 'scooter', 'motorcycle', 'ev']).optional(),
    vehicleNumber: z.string().trim().toUpperCase().regex(VehicleNumberRegex, 'Invalid vehicle number').optional(),
    licenseNumber: z.string().trim().toUpperCase().regex(DlRegex, 'Invalid driving licence number').optional(),
    licenseExpiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expiry must be YYYY-MM-DD').optional(),
    licenseFrontPath: z.string().trim().optional(),
    licenseBackPath: z.string().trim().optional(),
    rcDocumentPath: z.string().trim().optional(),
    insurancePolicyNumber: z.string().trim().optional(),
    insuranceExpiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expiry must be YYYY-MM-DD').optional(),
    aadhaarNumber: z.string().trim().regex(AadhaarRegex, 'Aadhaar must be 12 digits').optional(),
    aadhaarFrontPath: z.string().trim().optional(),
    aadhaarBackPath: z.string().trim().optional(),
    panNumber: z.string().trim().toUpperCase().regex(PanRegex, 'Invalid PAN format').optional(),
    panCardPath: z.string().trim().optional(),
    bankAccountNumber: z.string().trim().min(8).max(30).optional(),
    bankIfsc: z.string().trim().toUpperCase().regex(IfscRegex, 'Invalid IFSC code').optional(),
    bankBeneficiaryName: z.string().trim().min(2).max(120).optional(),
    bankName: z.string().trim().min(2).max(100).optional(),
    bankChequeDocumentPath: z.string().trim().optional(),
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
    licenseNumber: z.string().nullable(),
    licenseExpiryDate: z.string().nullable(),
    licenseFrontPath: z.string().nullable(),
    licenseBackPath: z.string().nullable(),
    rcNumber: z.string().nullable(),
    rcDocumentPath: z.string().nullable(),
    insurancePolicyNumber: z.string().nullable(),
    insuranceExpiryDate: z.string().nullable(),
    dob: z.string().nullable(),
    gender: z.string().nullable(),
    currentAddress: z.string().nullable(),
    emergencyContactName: z.string().nullable(),
    emergencyContactPhone: z.string().nullable(),
    emergencyContactRelation: z.string().nullable(),
    aadhaarNumber: z.string().nullable(),
    aadhaarFrontPath: z.string().nullable(),
    aadhaarBackPath: z.string().nullable(),
    panNumber: z.string().nullable(),
    panCardPath: z.string().nullable(),
    bankAccountNumber: z.string().nullable(),
    bankIfsc: z.string().nullable(),
    bankBeneficiaryName: z.string().nullable(),
    bankName: z.string().nullable(),
    bankChequeDocumentPath: z.string().nullable(),
    rejectionReason: z.string().nullable(),
    verifiedAt: z.string().nullable(),
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
    // personal numbers are never exposed — use POST /orders/:id/calls
    customer: z.object({ name: z.string().nullable() }),
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
    /** A doorstep photo must be attached when completing this delivery. */
    proofPhotoRequired: z.boolean(),
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

const DeliveryProof = z
  .object({
    /** Object path in the private `delivery-proofs` bucket: `<riderId>/<orderId>/<file>.jpg`. */
    path: z.string().max(300),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  })
  .meta({ id: 'DeliveryProof' });

export class DeliverDto extends createZodDto(
  z.object({ otp: z.string().regex(/^\d{4}$/), proof: DeliveryProof.optional() }),
) {}
export class UndeliverableDto extends createZodDto(
  z.object({ reason: z.string().trim().min(3).max(300), proof: DeliveryProof.optional() }),
) {}
export class SosDto extends createZodDto(
  z.object({
    lat: z.number(),
    lng: z.number(),
    orderId: z.uuid().optional(),
    note: z.string().max(300).optional(),
  }),
) {}
