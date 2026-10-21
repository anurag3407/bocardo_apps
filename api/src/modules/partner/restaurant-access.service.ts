import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';
import { DB, type Db } from '../../infra/database/database';

type MemberRole = 'owner' | 'manager' | 'staff';

/** Restaurant-scoped authorization: the caller must be a member with a sufficient role. */
@Injectable()
export class RestaurantAccess {
  constructor(@Inject(DB) private readonly db: Db) {}

  async assert(
    userId: string,
    restaurantId: string,
    allowed: MemberRole[] = ['owner', 'manager', 'staff'],
  ): Promise<MemberRole> {
    const member = await this.db
      .selectFrom('restaurant_members')
      .select('role')
      .where('restaurant_id', '=', restaurantId)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    // 404 rather than 403: don't reveal which restaurant ids exist
    if (!member) throw AppError.notFound('Restaurant');
    if (!allowed.includes(member.role))
      throw AppError.forbidden('Only the owner or a manager can do this');
    return member.role;
  }
}
