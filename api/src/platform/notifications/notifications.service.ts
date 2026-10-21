import { Inject, Injectable } from '@nestjs/common';
import { DB, type Db } from '../../infra/database/database';
import type { ClientApp } from '../../infra/database/db.types';
import { PUSH_SENDER, type PushMessage, type PushSender } from '../../infra/push/push-sender';

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(PUSH_SENDER) private readonly push: PushSender,
  ) {}

  async registerDevice(
    userId: string,
    input: { app: ClientApp; token: string; platform: 'ios' | 'android' | 'web' },
  ) {
    // A token moves with the device: re-registering under a new user takes it over.
    await this.db
      .insertInto('device_tokens')
      .values({ user_id: userId, app: input.app, token: input.token, platform: input.platform })
      .onConflict((oc) =>
        oc
          .column('token')
          .doUpdateSet({
            user_id: userId,
            app: input.app,
            platform: input.platform,
            updated_at: new Date(),
          }),
      )
      .execute();
  }

  async unregisterDevice(userId: string, token: string) {
    await this.db
      .deleteFrom('device_tokens')
      .where('user_id', '=', userId)
      .where('token', '=', token)
      .execute();
  }

  async notifyUser(userId: string, app: ClientApp, message: PushMessage) {
    const rows = await this.db
      .selectFrom('device_tokens')
      .select('token')
      .where('user_id', '=', userId)
      .where('app', '=', app)
      .execute();
    await this.send(
      rows.map((r) => r.token),
      message,
    );
  }

  async notifyRestaurantStaff(restaurantId: string, message: PushMessage) {
    const rows = await this.db
      .selectFrom('device_tokens as t')
      .innerJoin('restaurant_members as m', 'm.user_id', 't.user_id')
      .select('t.token')
      .where('m.restaurant_id', '=', restaurantId)
      .where('t.app', '=', 'restaurant')
      .execute();
    await this.send(
      rows.map((r) => r.token),
      message,
    );
  }

  private async send(tokens: string[], message: PushMessage) {
    if (!tokens.length) return;
    const { invalidTokens } = await this.push.send(tokens, message);
    if (invalidTokens.length)
      await this.db.deleteFrom('device_tokens').where('token', 'in', invalidTokens).execute();
  }
}
