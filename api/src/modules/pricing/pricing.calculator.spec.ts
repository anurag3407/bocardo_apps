import { calculatePrice, type PricingInput } from './pricing.calculator';

const zone = {
  deliveryBaseFeePaise: 2500,
  deliveryBaseKm: 2,
  deliveryPerKmPaise: 800,
  platformFeePaise: 500,
  freeDeliveryAbovePaise: null,
  surgeMultiplier: 1,
  rainMode: false,
};

const base: PricingInput = {
  lines: [{ unitPricePaise: 29900, quantity: 2 }],
  packagingFeePaise: 2000,
  distanceM: 1500,
  zone,
  coupon: null,
  tipPaise: 0,
};

describe('calculatePrice', () => {
  it('sums every component into the total', () => {
    const p = calculatePrice(base);
    expect(p.itemTotalPaise).toBe(59800);
    expect(p.deliveryFeePaise).toBe(2500);
    // 5% of (59800 + 2000) + 18% of 500
    expect(p.taxPaise).toBe(3090 + 90);
    expect(p.totalPaise).toBe(59800 + 2000 + 2500 + 500 + 3180);
  });

  it('charges per started km beyond the base distance, scaled by surge', () => {
    const p = calculatePrice({ ...base, distanceM: 4200, zone: { ...zone, surgeMultiplier: 1.5 } });
    // ceil(4.2 - 2) = 3 extra km
    expect(p.deliveryFeePaise).toBe(Math.round((2500 + 3 * 800) * 1.5));
  });

  it('waives delivery above the free-delivery threshold but keeps the rain surcharge', () => {
    const p = calculatePrice({
      ...base,
      zone: { ...zone, freeDeliveryAbovePaise: 49900, rainMode: true },
    });
    expect(p.deliveryFeePaise).toBe(0);
    expect(p.deliveryFeeWaivedPaise).toBe(2500);
    expect(p.rainSurchargePaise).toBe(2000);
  });

  it('caps percentage coupons and never discounts below zero', () => {
    const pct = calculatePrice({
      ...base,
      coupon: {
        code: 'WELCOME50',
        discountType: 'percent',
        discountValue: 50,
        maxDiscountPaise: 10000,
      },
    });
    expect(pct.discountPaise).toBe(10000);

    const flat = calculatePrice({
      ...base,
      lines: [{ unitPricePaise: 5000, quantity: 1 }],
      coupon: { code: 'BIG', discountType: 'flat', discountValue: 99999, maxDiscountPaise: null },
    });
    expect(flat.discountPaise).toBe(5000);
  });

  it('clamps tips to the allowed range', () => {
    expect(calculatePrice({ ...base, tipPaise: -100 }).tipPaise).toBe(0);
    expect(calculatePrice({ ...base, tipPaise: 10_000_000 }).tipPaise).toBe(50_000);
  });
});
