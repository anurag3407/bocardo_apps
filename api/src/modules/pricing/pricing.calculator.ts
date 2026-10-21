import { percentOf } from '../../common/utils/money';

export interface ZonePricing {
  deliveryBaseFeePaise: number;
  deliveryBaseKm: number;
  deliveryPerKmPaise: number;
  platformFeePaise: number;
  freeDeliveryAbovePaise: number | null;
  surgeMultiplier: number;
  rainMode: boolean;
}

export interface CouponTerms {
  code: string;
  discountType: 'percent' | 'flat';
  discountValue: number;
  maxDiscountPaise: number | null;
}

export interface PricingInput {
  lines: { unitPricePaise: number; quantity: number }[];
  packagingFeePaise: number;
  distanceM: number;
  zone: ZonePricing;
  coupon: CouponTerms | null;
  tipPaise: number;
}

export interface PriceBreakdown {
  itemTotalPaise: number;
  packagingFeePaise: number;
  deliveryFeePaise: number;
  deliveryFeeWaivedPaise: number;
  rainSurchargePaise: number;
  platformFeePaise: number;
  discountPaise: number;
  taxPaise: number;
  tipPaise: number;
  totalPaise: number;
  surgeMultiplier: number;
  couponCode: string | null;
}

export const PRICING_RULES = {
  /** GST on restaurant services (food + packaging, after discount). */
  foodGstPercent: 5,
  /** GST on platform convenience fee. */
  platformGstPercent: 18,
  rainSurchargePaise: 2000,
  maxTipPaise: 50_000,
} as const;

/** Pure, deterministic pricing — the same function produces quotes and final orders. */
export function calculatePrice(input: PricingInput): PriceBreakdown {
  const itemTotalPaise = input.lines.reduce((acc, l) => acc + l.unitPricePaise * l.quantity, 0);

  const km = input.distanceM / 1000;
  const extraKm = Math.max(0, Math.ceil(km - input.zone.deliveryBaseKm));
  const rawDelivery = Math.round(
    (input.zone.deliveryBaseFeePaise + extraKm * input.zone.deliveryPerKmPaise) *
      input.zone.surgeMultiplier,
  );
  const freeDelivery =
    input.zone.freeDeliveryAbovePaise !== null &&
    itemTotalPaise >= input.zone.freeDeliveryAbovePaise;
  const deliveryFeePaise = freeDelivery ? 0 : rawDelivery;
  const rainSurchargePaise = input.zone.rainMode ? PRICING_RULES.rainSurchargePaise : 0;

  const discountPaise = input.coupon ? couponDiscount(input.coupon, itemTotalPaise) : 0;

  const taxableFood = Math.max(0, itemTotalPaise - discountPaise + input.packagingFeePaise);
  const taxPaise =
    percentOf(taxableFood, PRICING_RULES.foodGstPercent) +
    percentOf(input.zone.platformFeePaise, PRICING_RULES.platformGstPercent);

  const tipPaise = Math.min(Math.max(0, Math.round(input.tipPaise)), PRICING_RULES.maxTipPaise);

  const totalPaise =
    itemTotalPaise +
    input.packagingFeePaise +
    deliveryFeePaise +
    rainSurchargePaise +
    input.zone.platformFeePaise +
    taxPaise +
    tipPaise -
    discountPaise;

  return {
    itemTotalPaise,
    packagingFeePaise: input.packagingFeePaise,
    deliveryFeePaise,
    deliveryFeeWaivedPaise: freeDelivery ? rawDelivery : 0,
    rainSurchargePaise,
    platformFeePaise: input.zone.platformFeePaise,
    discountPaise,
    taxPaise,
    tipPaise,
    totalPaise,
    surgeMultiplier: input.zone.surgeMultiplier,
    couponCode: input.coupon?.code ?? null,
  };
}

export function couponDiscount(coupon: CouponTerms, itemTotalPaise: number): number {
  const raw =
    coupon.discountType === 'percent'
      ? percentOf(itemTotalPaise, coupon.discountValue)
      : coupon.discountValue;
  const capped = coupon.maxDiscountPaise !== null ? Math.min(raw, coupon.maxDiscountPaise) : raw;
  return Math.min(capped, itemTotalPaise);
}
