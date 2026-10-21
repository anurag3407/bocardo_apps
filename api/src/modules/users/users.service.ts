import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { AppError } from '../../common/errors/app-error';
import { DB, type Db, type Executor } from '../../infra/database/database';
import type { ClientApp } from '../../infra/database/db.types';
import { ACTIVE_ORDER_STATUSES } from '../orders/domain/order-state-machine';
import type { ProfileDto, UpdateProfileDto } from './users.dto';

@Injectable()
export class UsersService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async getProfile(userId: string): Promise<ProfileDto> {
    const p = await this.db
      .selectFrom('profiles')
      .selectAll()
      .where('id', '=', userId)
      .executeTakeFirst();
    if (!p || p.deleted_at) throw AppError.notFound('Profile');
    return {
      id: p.id,
      fullName: p.full_name,
      phone: p.phone,
      email: p.email,
      avatarUrl: p.avatar_url,
      roles: p.roles as ProfileDto['roles'],
      adminRole: p.admin_role,
    };
  }

  async updateProfile(userId: string, input: UpdateProfileDto) {
    await this.db
      .updateTable('profiles')
      .set({
        ...(input.fullName !== undefined ? { full_name: input.fullName } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.avatarUrl !== undefined ? { avatar_url: input.avatarUrl } : {}),
      })
      .where('id', '=', userId)
      .execute();
    return this.getProfile(userId);
  }

  async addRole(userId: string, role: 'restaurant' | 'rider', executor: Executor = this.db) {
    await executor
      .updateTable('profiles')
      .set({ roles: sql`array_append(roles, ${role})` })
      .where('id', '=', userId)
      .where(sql<boolean>`not (${role} = any(roles))`)
      .execute();
  }

  /**
   * Account deletion (DPDP): personal data is anonymised; orders and ledger rows
   * are retained for tax/accounting. Refused while an order is in flight.
   */
  async deleteAccount(userId: string) {
    const active = await this.db
      .selectFrom('orders')
      .select('id')
      .where('customer_id', '=', userId)
      .where('status', 'in', ACTIVE_ORDER_STATUSES)
      .executeTakeFirst();
    if (active)
      throw AppError.conflict(
        'ACTIVE_ORDER_EXISTS',
        'Please wait until your current order is completed',
      );

    await this.db.transaction().execute(async (tx) => {
      await tx
        .updateTable('profiles')
        .set({
          full_name: 'Deleted user',
          phone: null,
          email: null,
          avatar_url: null,
          deleted_at: new Date(),
          is_blocked: true,
        })
        .where('id', '=', userId)
        .execute();
      await tx
        .updateTable('addresses')
        .set({ deleted_at: new Date() })
        .where('user_id', '=', userId)
        .execute();
      await tx.deleteFrom('device_tokens').where('user_id', '=', userId).execute();
    });
  }

  async appConfig(app: ClientApp) {
    const rows = await this.db
      .selectFrom('app_config')
      .select(['key', 'value'])
      .where('key', 'in', ['min_app_version', 'support'])
      .execute();
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value])) as {
      min_app_version?: Record<string, string>;
      support?: { phone?: string; email?: string };
    };
    return {
      minVersion: byKey.min_app_version?.[app] ?? '0.0.0',
      supportPhone: byKey.support?.phone ?? null,
      supportEmail: byKey.support?.email ?? null,
    };
  }
}
