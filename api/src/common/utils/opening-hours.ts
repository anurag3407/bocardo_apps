export interface OpeningSlot {
  dayOfWeek: number; // 0 = Sunday
  opensAt: string; // "HH:MM" or "HH:MM:SS"
  closesAt: string;
}

const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/** Local weekday + minute-of-day in the city's timezone (restaurants live in one tz). */
export function localClock(now: Date, timeZone: string): { dayOfWeek: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    dayOfWeek: days.indexOf(get('weekday')),
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/**
 * Whether `now` falls in any slot. A slot whose close time is <= its open time
 * runs past midnight into the next day; open == close means open all day.
 */
export function isWithinOpeningHours(slots: OpeningSlot[], now: Date, timeZone: string): boolean {
  const { dayOfWeek, minutes } = localClock(now, timeZone);
  const yesterday = (dayOfWeek + 6) % 7;

  return slots.some((slot) => {
    const open = toMinutes(slot.opensAt);
    const close = toMinutes(slot.closesAt);
    if (open === close) return slot.dayOfWeek === dayOfWeek;
    if (close > open) return slot.dayOfWeek === dayOfWeek && minutes >= open && minutes < close;
    // overnight slot: open part today, or the after-midnight tail of yesterday's slot
    return (
      (slot.dayOfWeek === dayOfWeek && minutes >= open) ||
      (slot.dayOfWeek === yesterday && minutes < close)
    );
  });
}
