import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { iso } from '../../common/http/schemas';
import { CouponsService } from './coupons.service';

export const CouponSchema = z
  .object({
    id: z.string(),
    code: z.string(),
    description: z.string().nullable(),
    discountType: z.enum(['percent', 'flat']),
    discountValue: z.number().int(),
    maxDiscountPaise: z.number().int().nullable(),
    minOrderPaise: z.number().int(),
    validUntil: z.string().nullable(),
    firstOrderOnly: z.boolean(),
    restaurantId: z.string().nullable(),
  })
  .meta({ id: 'Coupon' });

class CouponListDto extends createZodDto(z.array(CouponSchema)) {}
class CouponQueryDto extends createZodDto(z.object({ restaurantId: z.uuid().optional() })) {}

@ApiTags('promotions')
@ApiBearerAuth()
@Controller('coupons')
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get()
  @ZodResponse({ type: CouponListDto })
  async list(@Query() q: CouponQueryDto) {
    const rows = await this.coupons.listAvailable(q.restaurantId);
    return rows.map((c) => ({
      id: c.id,
      code: c.code,
      description: c.description,
      discountType: c.discount_type,
      discountValue: c.discount_value,
      maxDiscountPaise: c.max_discount_paise,
      minOrderPaise: c.min_order_paise,
      validUntil: iso(c.valid_until),
      firstOrderOnly: c.first_order_only,
      restaurantId: c.restaurant_id,
    }));
  }
}
