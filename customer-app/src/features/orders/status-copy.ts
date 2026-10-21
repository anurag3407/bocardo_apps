import type { CustomerOrder } from '@/core/api/generated/model';

/** Customer-facing headline for every (status, dispatchStatus) combination. */
export function statusHeadline(o: Pick<CustomerOrder, 'status' | 'dispatchStatus' | 'restaurant'>): { title: string; subtitle: string } {
  switch (o.status) {
    case 'PAYMENT_PENDING':
      return { title: 'Waiting for payment', subtitle: 'Complete the payment to place your order' };
    case 'PAYMENT_FAILED':
      return { title: 'Payment failed', subtitle: 'Your order was not placed. Any debited amount will be refunded.' };
    case 'PLACED':
      return { title: 'Order placed', subtitle: `Waiting for ${o.restaurant.name} to confirm` };
    case 'ACCEPTED':
    case 'READY': {
      const cooking = o.status === 'ACCEPTED' ? 'Your food is being prepared' : 'Your food is ready';
      if (o.dispatchStatus === 'AT_RESTAURANT') return { title: cooking, subtitle: 'Delivery partner is at the restaurant' };
      if (o.dispatchStatus === 'ASSIGNED') return { title: cooking, subtitle: 'Delivery partner is on the way to the restaurant' };
      if (o.dispatchStatus === 'FAILED') return { title: cooking, subtitle: 'Finding a delivery partner is taking longer than usual' };
      return { title: cooking, subtitle: 'Assigning a delivery partner' };
    }
    case 'PICKED_UP':
      return o.dispatchStatus === 'AT_DROP'
        ? { title: 'Delivery partner has arrived', subtitle: 'Share the OTP to receive your order' }
        : { title: 'On the way', subtitle: 'Your order has been picked up' };
    case 'DELIVERED':
      return { title: 'Delivered', subtitle: 'Enjoy your meal!' };
    case 'REJECTED':
    case 'CANCELLED':
      return { title: 'Order cancelled', subtitle: 'Any amount paid will be refunded to the original payment method' };
    case 'UNDELIVERED':
      return { title: 'Delivery unsuccessful', subtitle: 'We could not reach you at the delivery location' };
  }
}

export const ACTIVE_STATUSES = ['PAYMENT_PENDING', 'PLACED', 'ACCEPTED', 'READY', 'PICKED_UP'];
