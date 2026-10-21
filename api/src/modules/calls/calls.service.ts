import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';
import { ENV, type Env } from '../../config/env';
import { DB, type Db } from '../../infra/database/database';
import { KV_STORE, type KvStore } from '../../infra/kv/kv-store';
import {
  TELEPHONY_PROVIDER,
  type TelephonyProvider,
} from '../../infra/telephony/telephony-provider';
import { canCall, type CallParty } from './call-policy';

const CALL_TIME_LIMIT_S = 10 * 60;
const MAX_CALLS_PER_10_MIN = 6;

export interface CallResult {
  mode: 'callback' | 'direct';
  /** Only in development (`direct`): the number to dial. */
  dial: string | null;
  message: string;
}

/** Masked calling between the parties of an order. Numbers never leave the server. */
@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KV_STORE) private readonly kv: KvStore,
    @Inject(TELEPHONY_PROVIDER) private readonly telephony: TelephonyProvider,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async connect(userId: string, orderId: string, callee: CallParty): Promise<CallResult> {
    const order = await this.db
      .selectFrom('orders as o')
      .innerJoin('restaurants as r', 'r.id', 'o.restaurant_id')
      .select([
        'o.id',
        'o.status',
        'o.dispatch_status',
        'o.customer_id',
        'o.rider_id',
        'o.restaurant_id',
        'o.delivered_at',
        'o.delivery_address',
        'r.phone as restaurant_phone',
      ])
      .where('o.id', '=', orderId)
      .executeTakeFirst();
    if (!order) throw AppError.notFound('Order');

    const caller = await this.callerRole(userId, order);
    if (!caller) throw AppError.notFound('Order');
    const allowed = canCall(caller, callee, {
      status: order.status,
      dispatchStatus: order.dispatch_status,
      hasRider: !!order.rider_id,
      deliveredAt: order.delivered_at,
    });
    if (!allowed.ok) throw AppError.conflict('CALL_NOT_ALLOWED', allowed.reason);

    const count = await this.kv.incr(
      `calls:${orderId}:${userId}:${Math.floor(Date.now() / 600_000)}`,
      600,
    );
    if (count > MAX_CALLS_PER_10_MIN)
      throw AppError.tooManyRequests('Too many call attempts, please wait a few minutes');

    const [fromPhone, toPhone] = await Promise.all([
      this.ownPhone(userId),
      this.partyPhone(callee, order),
    ]);
    if (!fromPhone)
      throw AppError.unprocessable('NO_PHONE', 'Add a phone number to your account to make calls');
    if (!toPhone)
      throw AppError.unprocessable('CALLEE_UNREACHABLE', 'This contact cannot be reached by phone');

    const log = await this.db
      .insertInto('call_logs')
      .values({
        order_id: orderId,
        caller_id: userId,
        caller_role: caller,
        callee_role: callee,
        provider: this.telephony.name,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    try {
      const result = await this.telephony.connect({
        fromPhone,
        toPhone,
        timeLimitSeconds: CALL_TIME_LIMIT_S,
        statusCallbackUrl: `${this.env.API_PUBLIC_URL}/webhooks/telephony/${this.telephony.name}?token=${this.env.TELEPHONY_WEBHOOK_TOKEN ?? ''}`,
      });
      await this.db
        .updateTable('call_logs')
        .set({ provider_ref: result.providerRef })
        .where('id', '=', log.id)
        .execute();
      return result.mode === 'callback'
        ? {
            mode: 'callback',
            dial: null,
            message: 'You will receive a call from Bocardo in a few seconds',
          }
        : { mode: 'direct', dial: result.dial, message: 'Dialling directly (development mode)' };
    } catch (err) {
      this.logger.error(`call connect failed: ${(err as Error).message}`);
      await this.db
        .updateTable('call_logs')
        .set({ status: 'failed' })
        .where('id', '=', log.id)
        .execute();
      throw new AppError(502, 'CALL_FAILED', 'Could not connect the call, please try again');
    }
  }

  async recordStatus(provider: string, token: string | undefined, body: Record<string, string>) {
    if (!this.env.TELEPHONY_WEBHOOK_TOKEN || token !== this.env.TELEPHONY_WEBHOOK_TOKEN)
      throw AppError.unauthorized('Invalid token');
    if (provider !== this.telephony.name) return;
    const parsed = this.telephony.parseStatus(body);
    if (!parsed) return;
    await this.db
      .updateTable('call_logs')
      .set({ status: parsed.status, duration_seconds: parsed.durationSeconds })
      .where('provider', '=', provider)
      .where('provider_ref', '=', parsed.providerRef)
      .execute();
  }

  private async callerRole(
    userId: string,
    order: { customer_id: string; rider_id: string | null; restaurant_id: string },
  ): Promise<CallParty | null> {
    if (order.customer_id === userId) return 'customer';
    if (order.rider_id === userId) return 'rider';
    const member = await this.db
      .selectFrom('restaurant_members')
      .select('user_id')
      .where('restaurant_id', '=', order.restaurant_id)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return member ? 'restaurant' : null;
  }

  private async ownPhone(userId: string) {
    const p = await this.db
      .selectFrom('profiles')
      .select('phone')
      .where('id', '=', userId)
      .executeTakeFirst();
    return p?.phone ?? null;
  }

  private async partyPhone(
    party: CallParty,
    order: {
      customer_id: string;
      rider_id: string | null;
      restaurant_phone: string | null;
      delivery_address: { contactPhone: string | null };
    },
  ) {
    if (party === 'restaurant') return order.restaurant_phone;
    if (party === 'customer')
      return order.delivery_address.contactPhone ?? (await this.ownPhone(order.customer_id));
    return order.rider_id ? this.ownPhone(order.rider_id) : null;
  }
}
