import { computeSettlement, type SettlementInput } from './settlement';

const input: SettlementInput = {
  orderId: 'o',
  restaurantId: 'rest',
  riderId: 'rider',
  paymentMethod: 'online',
  totalPaise: 68_980,
  itemTotalPaise: 59_800,
  packagingFeePaise: 2_000,
  discountPaise: 0,
  taxPaise: 3_180,
  tipPaise: 1_000,
  commissionBps: 2000,
  restaurantFundedDiscount: false,
  riderPayoutPaise: 2_500,
};

const total = (lines: { amountPaise: number }[]) => lines.reduce((a, l) => a + l.amountPaise, 0);

describe('computeSettlement', () => {
  it('always balances to zero', () => {
    expect(total(computeSettlement(input))).toBe(0);
    expect(total(computeSettlement({ ...input, paymentMethod: 'cod' }))).toBe(0);
    expect(
      total(computeSettlement({ ...input, discountPaise: 5000, restaurantFundedDiscount: true })),
    ).toBe(0);
  });

  it('takes commission on the food value only', () => {
    const restaurant = computeSettlement(input).find((l) => l.entryType === 'restaurant_earning')!;
    expect(restaurant.amountPaise).toBe(59_800 + 2_000 - 11_960);
  });

  it('charges restaurant-funded discounts to the restaurant', () => {
    const lines = computeSettlement({
      ...input,
      discountPaise: 5000,
      restaurantFundedDiscount: true,
    });
    expect(lines.find((l) => l.entryType === 'restaurant_earning')!.amountPaise).toBe(
      59_800 + 2_000 - 11_960 - 5000,
    );
  });

  it('passes the full tip to the rider', () => {
    expect(computeSettlement(input).find((l) => l.entryType === 'rider_earning')!.amountPaise).toBe(
      3_500,
    );
  });

  it('records COD cash as owed by the rider', () => {
    const funding = computeSettlement({ ...input, paymentMethod: 'cod' })[0];
    expect(funding).toMatchObject({
      accountType: 'rider',
      amountPaise: -68_980,
      entryType: 'cod_cash_collected',
    });
  });
});
