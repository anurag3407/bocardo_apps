import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { AppError } from '../../common/errors/app-error';
import { DB, json, type Db, type Executor } from '../../infra/database/database';
import type { ClientApp } from '../../infra/database/db.types';
import { AuditService } from '../../platform/audit/audit.service';
import { ACTIVE_ORDER_STATUSES } from '../orders/domain/order-state-machine';
import { normalizeOtpPhone } from '../otp/otp-rules';
import type {
  DeletionRequestDto,
  ProfileDto,
  PublishReleaseDto,
  UpdateProfileDto,
} from './users.dto';

export interface AppReleaseEntry {
  latestVersion: string;
  versionCode?: number;
  minVersion?: string;
  apkUrl: string;
  releaseNotes?: string | null;
  updatedAt?: string;
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

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
   * Account deletion (DPDP/App Store/Play Store): personal data is anonymised; orders and ledger rows
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

    const activeRiderDelivery = await this.db
      .selectFrom('orders')
      .select('id')
      .where('rider_id', '=', userId)
      .where('status', 'in', ACTIVE_ORDER_STATUSES)
      .executeTakeFirst();
    if (activeRiderDelivery)
      throw AppError.conflict(
        'ACTIVE_DELIVERY_EXISTS',
        'Please wait until your active delivery is completed',
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
      await tx
        .updateTable('riders')
        .set({
          is_online: false,
          current_order_id: null,
          aadhaar_number: null,
          pan_number: null,
          bank_account_number: null,
          bank_ifsc: null,
          bank_beneficiary_name: null,
          license_number: null,
          rc_number: null,
          current_address: null,
          emergency_contact_phone: null,
        })
        .where('id', '=', userId)
        .execute();
      await tx.deleteFrom('device_tokens').where('user_id', '=', userId).execute();
    });
  }

  async appConfig(app: ClientApp) {
    const rows = await this.db
      .selectFrom('app_config')
      .select(['key', 'value'])
      .where('key', 'in', ['min_app_version', 'app_releases', 'support', 'campaign_icon'])
      .execute();
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value])) as {
      min_app_version?: Record<string, string>;
      app_releases?: Record<string, AppReleaseEntry>;
      support?: { phone?: string; email?: string };
      campaign_icon?: Record<string, string> | string;
    };
    const campaign =
      typeof byKey.campaign_icon === 'string'
        ? byKey.campaign_icon
        : byKey.campaign_icon?.[app] ?? null;
    const release = byKey.app_releases?.[app];

    return {
      minVersion: release?.minVersion ?? byKey.min_app_version?.[app] ?? '0.0.0',
      latestVersion: release?.latestVersion ?? null,
      apkUrl: release?.apkUrl ?? null,
      releaseNotes: release?.releaseNotes ?? null,
      supportPhone: byKey.support?.phone ?? null,
      supportEmail: byKey.support?.email ?? null,
      campaignIcon: campaign ?? null,
    };
  }

  /** Atomically records a new mobile APK release in `app_config` (`app_releases`). */
  async publishRelease(input: PublishReleaseDto) {
    return this.db.transaction().execute(async (tx) => {
      const existingRows = await tx
        .selectFrom('app_config')
        .select(['key', 'value'])
        .where('key', 'in', ['app_releases', 'min_app_version'])
        .forUpdate()
        .execute();
      const map = Object.fromEntries(existingRows.map((r) => [r.key, r.value])) as {
        app_releases?: Record<string, AppReleaseEntry>;
        min_app_version?: Record<string, string>;
      };

      const prevRelease = map.app_releases?.[input.app];
      const nextMin = input.force
        ? input.version
        : (input.minVersion ?? prevRelease?.minVersion ?? '0.0.1');

      const entry: AppReleaseEntry = {
        latestVersion: input.version,
        versionCode: input.versionCode,
        minVersion: nextMin,
        apkUrl: input.apkUrl,
        releaseNotes: input.releaseNotes ?? null,
        updatedAt: new Date().toISOString(),
      };
      const nextReleases = { ...(map.app_releases ?? {}), [input.app]: entry };

      await tx
        .insertInto('app_config')
        .values({ key: 'app_releases', value: json(nextReleases) })
        .onConflict((oc) =>
          oc.column('key').doUpdateSet({ value: json(nextReleases), updated_at: new Date() }),
        )
        .execute();

      if (input.force) {
        const nextMinVersions = { ...(map.min_app_version ?? {}), [input.app]: input.version };
        await tx
          .insertInto('app_config')
          .values({ key: 'min_app_version', value: json(nextMinVersions) })
          .onConflict((oc) =>
            oc.column('key').doUpdateSet({ value: json(nextMinVersions), updated_at: new Date() }),
          )
          .execute();
      }

      await this.audit.record(tx, {
        actorId: null,
        action: 'app.release',
        entityType: 'app_config',
        entityId: input.app,
        before: prevRelease ?? null,
        after: entry,
      });

      return entry;
    });
  }

  /** Logs a web deletion request and opens an ops/support ticket if the phone matches an account. */
  async requestDeletion(input: DeletionRequestDto) {
    const parsed = normalizeOtpPhone(input.phone, ['91']);
    if (!parsed.ok) {
      throw AppError.badRequest(parsed.reason, 'Enter a valid 10-digit Indian mobile number');
    }
    const profile = await this.db
      .selectFrom('profiles')
      .select(['id', 'deleted_at'])
      .where('phone', '=', parsed.phone)
      .executeTakeFirst();

    await this.db.transaction().execute(async (tx) => {
      if (profile && !profile.deleted_at) {
        await tx
          .insertInto('support_tickets')
          .values({
            user_id: profile.id,
            app: input.app,
            category: 'account',
            subject: 'Web account deletion request',
            description:
              input.reason?.trim() ||
              `Account deletion requested via web form for +${parsed.phone} (${input.app}).`,
          })
          .execute();
      }
      await this.audit.record(tx, {
        actorId: profile?.id ?? null,
        action: 'account.deletion_requested',
        entityType: 'user',
        entityId: profile?.id,
        after: {
          app: input.app,
          phoneMasked: `${parsed.phone.slice(0, 4)}…${parsed.phone.slice(-2)}`,
          matchedAccount: Boolean(profile && !profile.deleted_at),
          reason: input.reason ?? null,
        },
      });
    });
  }
}
