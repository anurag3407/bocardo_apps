import { isWithinOpeningHours } from '../../common/utils/opening-hours';
import { estimateDeliveryMinutes, restaurantAvailability } from './restaurant-availability';

const TZ = 'Asia/Kolkata';
// 2026-10-21 is a Wednesday (dayOfWeek 3). 14:30 UTC = 20:00 IST.
const wedEvening = new Date('2026-10-21T14:30:00Z');
// 20:00 UTC Wednesday = 01:30 IST Thursday.
const thuSmallHours = new Date('2026-10-21T20:00:00Z');

describe('opening hours', () => {
  it('matches a same-day slot', () => {
    expect(
      isWithinOpeningHours([{ dayOfWeek: 3, opensAt: '11:00', closesAt: '23:00' }], wedEvening, TZ),
    ).toBe(true);
    expect(
      isWithinOpeningHours([{ dayOfWeek: 3, opensAt: '11:00', closesAt: '15:00' }], wedEvening, TZ),
    ).toBe(false);
  });

  it("covers the after-midnight tail of yesterday's overnight slot", () => {
    const slots = [{ dayOfWeek: 3, opensAt: '18:00', closesAt: '02:00' }];
    expect(isWithinOpeningHours(slots, wedEvening, TZ)).toBe(true);
    expect(isWithinOpeningHours(slots, thuSmallHours, TZ)).toBe(true);
  });

  it('treats open == close as open all day', () => {
    expect(
      isWithinOpeningHours([{ dayOfWeek: 3, opensAt: '00:00', closesAt: '00:00' }], wedEvening, TZ),
    ).toBe(true);
  });

  it('evaluates in the city timezone, not server time', () => {
    // 20:00 IST is still 14:30 UTC; a 19:00-22:00 IST slot must match.
    expect(
      isWithinOpeningHours([{ dayOfWeek: 3, opensAt: '19:00', closesAt: '22:00' }], wedEvening, TZ),
    ).toBe(true);
  });
});

describe('restaurantAvailability', () => {
  const allDay = [{ dayOfWeek: 3, opensAt: '00:00', closesAt: '00:00' }];
  const open = { status: 'active' as const, is_open: true, busy_until: null };

  it('is open when everything lines up', () => {
    expect(restaurantAvailability(open, allDay, wedEvening, TZ)).toEqual({
      isOpen: true,
      closedReason: null,
    });
  });

  it('reports why it is closed, in priority order', () => {
    expect(
      restaurantAvailability({ ...open, status: 'suspended' }, allDay, wedEvening, TZ).closedReason,
    ).toBe('INACTIVE');
    expect(
      restaurantAvailability({ ...open, is_open: false }, allDay, wedEvening, TZ).closedReason,
    ).toBe('PAUSED');
    expect(
      restaurantAvailability(
        { ...open, busy_until: new Date(wedEvening.getTime() + 60_000) },
        allDay,
        wedEvening,
        TZ,
      ).closedReason,
    ).toBe('BUSY');
    expect(restaurantAvailability(open, [], wedEvening, TZ).closedReason).toBe('OUTSIDE_HOURS');
  });

  it('ignores an expired busy window', () => {
    expect(
      restaurantAvailability(
        { ...open, busy_until: new Date(wedEvening.getTime() - 1) },
        allDay,
        wedEvening,
        TZ,
      ).isOpen,
    ).toBe(true);
  });
});

describe('estimateDeliveryMinutes', () => {
  it('rounds up to the next 5 minutes', () => {
    expect(estimateDeliveryMinutes(20, 2000) % 5).toBe(0);
    expect(estimateDeliveryMinutes(20, 0)).toBe(25);
  });
});
