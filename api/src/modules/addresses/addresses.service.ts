import { Inject, Injectable } from '@nestjs/common';
import type { Selectable } from 'kysely';
import { AppError } from '../../common/errors/app-error';
import { DB, type Db, type Executor } from '../../infra/database/database';
import type { AddressesTable } from '../../infra/database/db.types';
import { ZonesService } from '../zones/zones.service';
import type { AddressDto, CreateAddressDto, UpdateAddressDto } from './addresses.dto';

type AddressRow = Selectable<AddressesTable>;

const MAX_ADDRESSES = 20;

@Injectable()
export class AddressesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly zones: ZonesService,
  ) {}

  async list(userId: string): Promise<AddressDto[]> {
    const rows = await this.db
      .selectFrom('addresses')
      .selectAll()
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .orderBy('is_default', 'desc')
      .orderBy('created_at', 'desc')
      .execute();
    return Promise.all(rows.map((r) => this.toDto(r)));
  }

  /** Owned, non-deleted address or 404 — never leaks other users' addresses. */
  async getOwned(userId: string, id: string, executor: Executor = this.db): Promise<AddressRow> {
    const row = await executor
      .selectFrom('addresses')
      .selectAll()
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!row) throw AppError.notFound('Address');
    return row;
  }

  async create(userId: string, input: CreateAddressDto): Promise<AddressDto> {
    const row = await this.db.transaction().execute(async (tx) => {
      const { count } = await tx
        .selectFrom('addresses')
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .where('user_id', '=', userId)
        .where('deleted_at', 'is', null)
        .executeTakeFirstOrThrow();
      if (count >= MAX_ADDRESSES)
        throw AppError.unprocessable(
          'ADDRESS_LIMIT',
          `You can save up to ${MAX_ADDRESSES} addresses`,
        );
      const makeDefault = input.isDefault || count === 0;
      if (makeDefault)
        await tx
          .updateTable('addresses')
          .set({ is_default: false })
          .where('user_id', '=', userId)
          .execute();
      return tx
        .insertInto('addresses')
        .values({
          user_id: userId,
          label: input.label,
          line1: input.line1,
          line2: input.line2 ?? null,
          landmark: input.landmark ?? null,
          city: input.city ?? null,
          pincode: input.pincode ?? null,
          lat: input.lat,
          lng: input.lng,
          is_default: makeDefault,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    });
    return this.toDto(row);
  }

  async update(userId: string, id: string, input: UpdateAddressDto): Promise<AddressDto> {
    await this.getOwned(userId, id);
    const row = await this.db.transaction().execute(async (tx) => {
      if (input.isDefault)
        await tx
          .updateTable('addresses')
          .set({ is_default: false })
          .where('user_id', '=', userId)
          .execute();
      return tx
        .updateTable('addresses')
        .set({
          ...(input.label !== undefined && { label: input.label }),
          ...(input.line1 !== undefined && { line1: input.line1 }),
          ...(input.line2 !== undefined && { line2: input.line2 ?? null }),
          ...(input.landmark !== undefined && { landmark: input.landmark ?? null }),
          ...(input.city !== undefined && { city: input.city ?? null }),
          ...(input.pincode !== undefined && { pincode: input.pincode ?? null }),
          ...(input.lat !== undefined && { lat: input.lat }),
          ...(input.lng !== undefined && { lng: input.lng }),
          ...(input.isDefault !== undefined && { is_default: input.isDefault }),
        })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
    return this.toDto(row);
  }

  /** Soft delete: past orders keep a snapshot, so nothing breaks. */
  async remove(userId: string, id: string) {
    await this.getOwned(userId, id);
    await this.db
      .updateTable('addresses')
      .set({ deleted_at: new Date(), is_default: false })
      .where('id', '=', id)
      .execute();
  }

  private async toDto(r: AddressRow): Promise<AddressDto> {
    const zone = await this.zones.locate(r.lat, r.lng);
    return {
      id: r.id,
      label: r.label,
      line1: r.line1,
      line2: r.line2,
      landmark: r.landmark,
      city: r.city,
      pincode: r.pincode,
      lat: r.lat,
      lng: r.lng,
      isDefault: r.is_default,
      serviceable: zone !== null,
    };
  }
}
