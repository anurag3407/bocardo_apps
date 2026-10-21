import { AppError } from '../../../common/errors/app-error';
import type { DispatchStatus, OrderStatus } from '../../../infra/database/db.types';

/**
 * The single definition of legal order transitions.
 *
 *   PAYMENT_PENDING ─► PLACED ─► ACCEPTED ─► READY ─► PICKED_UP ─► DELIVERED
 *        │               │          │          │          └──► UNDELIVERED
 *        ▼               ▼          └──────────┴──► CANCELLED
 *   PAYMENT_FAILED   REJECTED / CANCELLED
 *
 * ACCEPTED means "being prepared". Riders may confirm pickup from ACCEPTED when the
 * restaurant forgot to mark the order ready.
 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PAYMENT_PENDING: ['PLACED', 'PAYMENT_FAILED', 'CANCELLED'],
  PAYMENT_FAILED: [],
  PLACED: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['READY', 'PICKED_UP', 'CANCELLED'],
  READY: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['DELIVERED', 'UNDELIVERED'],
  DELIVERED: [],
  REJECTED: [],
  CANCELLED: [],
  UNDELIVERED: [],
};

export const DISPATCH_TRANSITIONS: Readonly<Record<DispatchStatus, readonly DispatchStatus[]>> = {
  UNASSIGNED: ['SEARCHING'],
  SEARCHING: ['ASSIGNED', 'FAILED', 'UNASSIGNED'],
  ASSIGNED: ['AT_RESTAURANT', 'PICKED', 'SEARCHING', 'UNASSIGNED'],
  AT_RESTAURANT: ['PICKED', 'SEARCHING', 'UNASSIGNED'],
  PICKED: ['AT_DROP', 'DONE'],
  AT_DROP: ['DONE'],
  DONE: [],
  FAILED: ['SEARCHING', 'UNASSIGNED'],
};

export const ACTIVE_ORDER_STATUSES: readonly OrderStatus[] = [
  'PAYMENT_PENDING',
  'PLACED',
  'ACCEPTED',
  'READY',
  'PICKED_UP',
];
export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = [
  'PAYMENT_FAILED',
  'DELIVERED',
  'REJECTED',
  'CANCELLED',
  'UNDELIVERED',
];

export const canTransition = (from: OrderStatus, to: OrderStatus) =>
  ORDER_TRANSITIONS[from].includes(to);
export const canTransitionDispatch = (from: DispatchStatus, to: DispatchStatus) =>
  DISPATCH_TRANSITIONS[from].includes(to);

export function assertTransition(from: OrderStatus, to: OrderStatus) {
  if (!canTransition(from, to)) {
    throw AppError.conflict('INVALID_ORDER_TRANSITION', `Order cannot move from ${from} to ${to}`, {
      from,
      to,
    });
  }
}

export function assertDispatchTransition(from: DispatchStatus, to: DispatchStatus) {
  if (!canTransitionDispatch(from, to)) {
    throw AppError.conflict(
      'INVALID_DISPATCH_TRANSITION',
      `Dispatch cannot move from ${from} to ${to}`,
      { from, to },
    );
  }
}

/** Timestamp column stamped when an order enters a status. */
export const STATUS_TIMESTAMP: Partial<
  Record<
    OrderStatus,
    'placed_at' | 'accepted_at' | 'ready_at' | 'picked_up_at' | 'delivered_at' | 'cancelled_at'
  >
> = {
  PLACED: 'placed_at',
  ACCEPTED: 'accepted_at',
  READY: 'ready_at',
  PICKED_UP: 'picked_up_at',
  DELIVERED: 'delivered_at',
  CANCELLED: 'cancelled_at',
  REJECTED: 'cancelled_at',
  PAYMENT_FAILED: 'cancelled_at',
  UNDELIVERED: 'cancelled_at',
};
