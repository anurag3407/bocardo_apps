import { AppError } from '../../../common/errors/app-error';
import {
  assertTransition,
  canTransition,
  canTransitionDispatch,
  ORDER_TRANSITIONS,
  TERMINAL_ORDER_STATUSES,
} from './order-state-machine';

describe('order state machine', () => {
  it('follows the happy path', () => {
    const path = [
      'PAYMENT_PENDING',
      'PLACED',
      'ACCEPTED',
      'READY',
      'PICKED_UP',
      'DELIVERED',
    ] as const;
    for (let i = 0; i < path.length - 1; i++)
      expect(canTransition(path[i], path[i + 1])).toBe(true);
  });

  it('terminal states have no exits', () => {
    for (const s of TERMINAL_ORDER_STATUSES) expect(ORDER_TRANSITIONS[s]).toHaveLength(0);
  });

  it('forbids cancelling after pickup (food is with the rider)', () => {
    expect(canTransition('PICKED_UP', 'CANCELLED')).toBe(false);
  });

  it('forbids skipping restaurant acceptance', () => {
    expect(canTransition('PLACED', 'READY')).toBe(false);
    expect(canTransition('PLACED', 'PICKED_UP')).toBe(false);
  });

  it('allows rider pickup when the restaurant forgot to mark ready', () => {
    expect(canTransition('ACCEPTED', 'PICKED_UP')).toBe(true);
  });

  it('throws a typed conflict error on illegal transitions', () => {
    expect(() => assertTransition('DELIVERED', 'CANCELLED')).toThrow(AppError);
    try {
      assertTransition('DELIVERED', 'CANCELLED');
    } catch (e) {
      expect((e as AppError).code).toBe('INVALID_ORDER_TRANSITION');
    }
  });

  it('dispatch can be re-opened for reassignment before pickup only', () => {
    expect(canTransitionDispatch('ASSIGNED', 'SEARCHING')).toBe(true);
    expect(canTransitionDispatch('AT_RESTAURANT', 'SEARCHING')).toBe(true);
    expect(canTransitionDispatch('PICKED', 'SEARCHING')).toBe(false);
  });
});
