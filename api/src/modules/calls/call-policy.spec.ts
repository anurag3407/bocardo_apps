import { canCall } from './call-policy';

const order = (over: Partial<Parameters<typeof canCall>[2]> = {}) => ({
  status: 'PICKED_UP' as const,
  dispatchStatus: 'PICKED' as const,
  hasRider: true,
  deliveredAt: null,
  ...over,
});

describe('call policy', () => {
  it('lets customer and rider reach each other during delivery', () => {
    expect(canCall('customer', 'rider', order()).ok).toBe(true);
    expect(canCall('rider', 'customer', order()).ok).toBe(true);
  });

  it('blocks calls to a rider before one is assigned', () => {
    expect(
      canCall(
        'customer',
        'rider',
        order({ status: 'ACCEPTED', dispatchStatus: 'SEARCHING', hasRider: false }),
      ).ok,
    ).toBe(false);
  });

  it('allows a short grace window after delivery, then closes', () => {
    const now = new Date('2026-10-22T12:00:00Z');
    expect(
      canCall(
        'customer',
        'rider',
        order({ status: 'DELIVERED', deliveredAt: new Date('2026-10-22T11:45:00Z') }),
        now,
      ).ok,
    ).toBe(true);
    expect(
      canCall(
        'customer',
        'rider',
        order({ status: 'DELIVERED', deliveredAt: new Date('2026-10-22T11:00:00Z') }),
        now,
      ).ok,
    ).toBe(false);
  });

  it('never allows calls on cancelled orders or to oneself', () => {
    expect(canCall('customer', 'rider', order({ status: 'CANCELLED' })).ok).toBe(false);
    expect(canCall('rider', 'rider', order()).ok).toBe(false);
  });

  it('stops restaurant → customer calls once the food has left', () => {
    expect(canCall('restaurant', 'customer', order({ status: 'ACCEPTED' })).ok).toBe(true);
    expect(canCall('restaurant', 'customer', order()).ok).toBe(false);
  });
});
