import type { ActorType, DispatchStatus, OrderStatus } from '../../infra/database/db.types';

export type CallParty = Extract<ActorType, 'customer' | 'rider' | 'restaurant'>;

const PAIRS: Record<CallParty, CallParty[]> = {
  customer: ['rider', 'restaurant'],
  rider: ['customer', 'restaurant'],
  restaurant: ['rider', 'customer'],
};

const ACTIVE: OrderStatus[] = ['PLACED', 'ACCEPTED', 'READY', 'PICKED_UP'];
const AFTER_DELIVERY_GRACE_MS = 30 * 60 * 1000;

/**
 * Who may call whom about an order, and when. Calls are only possible while the order is in
 * flight (plus a short grace period after delivery for "you forgot the drinks" situations).
 */
export function canCall(
  caller: CallParty,
  callee: CallParty,
  order: {
    status: OrderStatus;
    dispatchStatus: DispatchStatus;
    hasRider: boolean;
    deliveredAt: Date | null;
  },
  now = new Date(),
): { ok: true } | { ok: false; reason: string } {
  if (!PAIRS[caller].includes(callee)) return { ok: false, reason: 'This call is not allowed' };
  const involvesRider = caller === 'rider' || callee === 'rider';
  if (involvesRider && !order.hasRider)
    return { ok: false, reason: 'No delivery partner is assigned yet' };

  const inGrace =
    order.status === 'DELIVERED' &&
    !!order.deliveredAt &&
    now.getTime() - order.deliveredAt.getTime() < AFTER_DELIVERY_GRACE_MS;
  if (!ACTIVE.includes(order.status) && !inGrace)
    return { ok: false, reason: 'Calling is only available while the order is active' };
  // the restaurant has nothing to discuss with the customer once the food has left
  if (
    caller === 'restaurant' &&
    callee === 'customer' &&
    (order.status === 'PICKED_UP' || order.status === 'DELIVERED')
  ) {
    return { ok: false, reason: 'The order has already been picked up' };
  }
  return { ok: true };
}
