import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { AdminRoles, CurrentUser, Roles } from '../../common/auth/decorators';
import { Idempotent } from '../../common/idempotency/idempotent.decorator';
import {
  AdminCancelDto,
  AdminOrderDetailDto,
  AdminOrderPageDto,
  AdminOrdersQueryDto,
  AdminRefundDto,
  CityQueryDto,
  LiveMapDto,
  OverviewDto,
  ReassignDto,
} from './admin.dto';
import { AdminOpsService } from './admin-ops.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin')
export class AdminOpsController {
  constructor(private readonly ops: AdminOpsService) {}

  @AdminRoles('ops', 'support', 'finance')
  @Get('overview')
  @ZodResponse({ type: OverviewDto })
  overview(@Query() q: CityQueryDto) {
    return this.ops.overview(q.cityId);
  }

  @AdminRoles('ops', 'support')
  @Get('live-map')
  @ZodResponse({ type: LiveMapDto })
  liveMap(@Query() q: CityQueryDto) {
    return this.ops.liveMap(q.cityId);
  }

  @AdminRoles('ops', 'support', 'finance')
  @Get('orders')
  @ZodResponse({ type: AdminOrderPageDto })
  orders(@Query() q: AdminOrdersQueryDto) {
    return this.ops.listOrders(q);
  }

  @AdminRoles('ops', 'support', 'finance')
  @Get('orders/:id')
  @ZodResponse({ type: AdminOrderDetailDto })
  order(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.orderDetail(id);
  }

  @AdminRoles('ops', 'support')
  @Post('orders/:id/cancel')
  @Idempotent()
  @ZodResponse({ type: AdminOrderDetailDto, status: 200 })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AdminCancelDto,
  ) {
    return this.ops.cancelOrder(id, user.id, body.reason);
  }

  @AdminRoles('ops')
  @Post('orders/:id/reassign')
  @Idempotent()
  @ZodResponse({ type: AdminOrderDetailDto, status: 200 })
  reassign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReassignDto,
  ) {
    return this.ops.reassign(id, user.id, body.reason);
  }

  @AdminRoles('support', 'finance')
  @Post('orders/:id/refund')
  @Idempotent()
  @ZodResponse({ type: AdminOrderDetailDto, status: 200 })
  refund(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AdminRefundDto,
  ) {
    return this.ops.refund(id, user.id, body.amountPaise, body.reason);
  }
}
