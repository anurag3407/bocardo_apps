import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { iso } from '../../common/http/schemas';
import { ENV, type Env } from '../../config/env';
import { DB, type Db } from '../../infra/database/database';
import type { DispatchStatus, Order, OrderStatus } from '../../infra/database/db.types';
import type { PushMessage } from '../../infra/push/push-sender';
import { RealtimePublisher, topics } from '../../infra/realtime/realtime-publisher';
import { NotificationsService } from '../../platform/notifications/notifications.service';
import { OutboxRegistry } from '../../platform/outbox/outbox.registry';
import { deliveryOtp } from './domain/delivery-otp';

const rupees = (paise: number) => `₹${(paise / 100).toFixed(0)}`;

/**
 * Fans order changes out to every party: realtime channels for open screens,
 * push for everything else. Runs from the outbox, so it is retried on failure.
 */
@Injectable()
export class OrderNotifier implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly registry: OutboxRegistry,
    private readonly realtime: RealtimePublisher,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    this.registry.on('order.status_changed', (p) =>
      this.onStatus(p.orderId as string, p.to as OrderStatus, p.actorType as string),
    );
    this.registry.on('order.dispatch_changed', (p) =>
      this.onDispatch(p.orderId as string, p.to as DispatchStatus),
    );
  }

  private async load(orderId: string) {
    return this.db
      .selectFrom('orders as o')
      .innerJoin('restaurants as r', 'r.id', 'o.restaurant_id')
      .selectAll('o')
      .select('r.name as restaurant_name')
      .where('o.id', '=', orderId)
      .executeTakeFirstOrThrow();
  }

  private async broadcast(order: Order) {
    const payload = {
      orderId: order.id,
      status: order.status,
      dispatchStatus: order.dispatch_status,
      riderId: order.rider_id,
      estimatedDeliveryAt: iso(order.estimated_delivery_at),
      version: order.version,
    };
    await this.realtime.publish(
      { topic: topics.order(order.id), event: 'order_updated', payload },
      { topic: topics.restaurant(order.restaurant_id), event: 'order_updated', payload },
      ...(order.rider_id
        ? [{ topic: topics.rider(order.rider_id), event: 'order_updated', payload }]
        : []),
    );
  }

  private async onStatus(orderId: string, to: OrderStatus, actorType: string) {
    const order = await this.load(orderId);
    await this.broadcast(order);

    const data = { orderId, status: to, type: 'order_status' };
    const toCustomer = (m: Omit<PushMessage, 'data'>) =>
      this.notifications.notifyUser(order.customer_id, 'customer', { ...m, data });
    const toRestaurant = (m: Omit<PushMessage, 'data'>) =>
      this.notifications.notifyRestaurantStaff(order.restaurant_id, { ...m, data });
    const toRider = (m: Omit<PushMessage, 'data'>) =>
      order.rider_id
        ? this.notifications.notifyUser(order.rider_id, 'rider', { ...m, data })
        : Promise.resolve();

    switch (to) {
      case 'PLACED':
        await Promise.all([
          toRestaurant({
            title: `New order #${order.short_code}`,
            body: `${rupees(order.total_paise)} · ${order.payment_method === 'cod' ? 'Cash' : 'Paid online'} — accept now`,
            channel: 'orders',
          }),
          toCustomer({
            title: 'Order placed',
            body: `Waiting for ${order.restaurant_name} to confirm`,
          }),
        ]);
        break;
      case 'ACCEPTED':
        await toCustomer({
          title: 'Order confirmed',
          body: `${order.restaurant_name} is preparing your food`,
        });
        break;
      case 'READY':
        await toRider({
          title: 'Order is ready',
          body: `Pick up #${order.short_code} from ${order.restaurant_name}`,
          channel: 'offers',
        });
        break;
      case 'PICKED_UP':
        await toCustomer({
          title: 'Out for delivery',
          body: `Your order is on the way. Share OTP ${deliveryOtp(this.env.APP_SECRET, order.id)} with your delivery partner`,
        });
        break;
      case 'DELIVERED':
        await toCustomer({
          title: 'Delivered!',
          body: `Enjoy your meal from ${order.restaurant_name}. Tap to rate.`,
        });
        break;
      case 'PAYMENT_FAILED':
        await toCustomer({
          title: 'Payment failed',
          body: 'Your order was not placed. Any amount debited will be refunded.',
        });
        break;
      case 'REJECTED':
      case 'CANCELLED': {
        const refundNote =
          order.payment_status === 'captured' ? ' Your refund has been initiated.' : '';
        const tasks: Promise<void>[] = [];
        if (actorType !== 'customer') {
          tasks.push(
            toCustomer({
              title: 'Order cancelled',
              body: `${order.cancel_reason ?? 'Your order was cancelled.'}${refundNote}`,
            }),
          );
        }
        if (actorType !== 'restaurant')
          tasks.push(
            toRestaurant({
              title: `Order #${order.short_code} cancelled`,
              body: 'Stop preparing this order',
              channel: 'orders',
            }),
          );
        tasks.push(
          toRider({
            title: 'Delivery cancelled',
            body: `Order #${order.short_code} was cancelled`,
          }),
        );
        await Promise.all(tasks);
        break;
      }
      case 'UNDELIVERED':
        await toCustomer({
          title: 'Delivery unsuccessful',
          body: 'We could not reach you. Contact support if this is a mistake.',
        });
        break;
    }
  }

  private async onDispatch(orderId: string, to: DispatchStatus) {
    const order = await this.load(orderId);
    await this.broadcast(order);
    const data = { orderId, dispatchStatus: to, type: 'dispatch_status' };

    if (to === 'ASSIGNED' && order.rider_id) {
      const rider = await this.db
        .selectFrom('profiles')
        .select('full_name')
        .where('id', '=', order.rider_id)
        .executeTakeFirst();
      await this.notifications.notifyUser(order.customer_id, 'customer', {
        title: 'Delivery partner assigned',
        body: `${rider?.full_name ?? 'Your delivery partner'} will pick up your order`,
        data,
      });
    }
    if (to === 'AT_DROP') {
      await this.notifications.notifyUser(order.customer_id, 'customer', {
        title: 'Your order has arrived',
        body: 'Your delivery partner is at your location',
        data,
      });
    }
    if (to === 'FAILED') {
      await Promise.all([
        this.notifications.notifyUser(order.customer_id, 'customer', {
          title: 'Finding a delivery partner',
          body: 'It is taking longer than usual. We are on it.',
          data,
        }),
        this.realtime.publish({
          topic: topics.adminOps(order.city_id),
          event: 'dispatch_failed',
          payload: { orderId, shortCode: order.short_code },
        }),
      ]);
    }
  }
}
