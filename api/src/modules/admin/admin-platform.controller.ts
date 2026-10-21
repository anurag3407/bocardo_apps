import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { AdminRoles, CurrentUser, Roles } from '../../common/auth/decorators';
import { Idempotent } from '../../common/idempotency/idempotent.decorator';
import { TicketDto, TicketSchema } from '../feedback/feedback.dto';
import { LedgerService } from '../finance/ledger.service';
import {
  AdminCouponDto,
  AdminCouponListDto,
  AppConfigEntryDto,
  AppConfigListDto,
  AuditPageDto,
  AuditQueryDto,
  CityListDto,
  CityQueryDto,
  CreateCityDto,
  CreateCouponDto,
  CreateZoneDto,
  MarkPaidDto,
  PayoutPageDto,
  PayoutsQueryDto,
  RunPayoutsResultDto,
  SetAppConfigDto,
  TicketsQueryDto,
  UpdateCouponDto,
  UpdateTicketDto,
  UpdateZoneDto,
  ZoneDto,
  ZoneListDto,
} from './admin.dto';
import { AdminCommerceService } from './admin-commerce.service';
import { AdminGeoService } from './admin-geo.service';

class TicketPageDto extends createZodDto(
  z.object({ items: z.array(TicketSchema), nextCursor: z.string().nullable() }),
) {}
class CityDto extends createZodDto(
  z.object({ id: z.string(), name: z.string(), timezone: z.string(), isActive: z.boolean() }),
) {}

@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin')
export class AdminPlatformController {
  constructor(
    private readonly geo: AdminGeoService,
    private readonly commerce: AdminCommerceService,
    private readonly ledger: LedgerService,
  ) {}

  // ── Geography ──────────────────────────────────────────────────────────
  @AdminRoles('ops', 'support', 'finance')
  @Get('cities')
  @ZodResponse({ type: CityListDto })
  cities() {
    return this.geo.cities();
  }

  @AdminRoles('super_admin')
  @Post('cities')
  @ZodResponse({ type: CityDto, status: 201 })
  createCity(@CurrentUser() user: AuthUser, @Body() body: CreateCityDto) {
    return this.geo.createCity(user.id, body);
  }

  @AdminRoles('ops', 'support', 'finance')
  @Get('zones')
  @ZodResponse({ type: ZoneListDto })
  zones(@Query() q: CityQueryDto) {
    return this.geo.zones(q.cityId);
  }

  @AdminRoles('ops')
  @Post('zones')
  @ZodResponse({ type: ZoneDto, status: 201 })
  createZone(@CurrentUser() user: AuthUser, @Body() body: CreateZoneDto) {
    return this.geo.createZone(user.id, body);
  }

  @AdminRoles('ops')
  @Patch('zones/:id')
  @ZodResponse({ type: ZoneDto })
  updateZone(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateZoneDto,
  ) {
    return this.geo.updateZone(id, user.id, body);
  }

  // ── Coupons ────────────────────────────────────────────────────────────
  @AdminRoles('finance', 'ops')
  @Get('coupons')
  @ZodResponse({ type: AdminCouponListDto })
  coupons() {
    return this.commerce.coupons();
  }

  @AdminRoles('finance')
  @Post('coupons')
  @ZodResponse({ type: AdminCouponDto, status: 201 })
  createCoupon(@CurrentUser() user: AuthUser, @Body() body: CreateCouponDto) {
    return this.commerce.createCoupon(user.id, body);
  }

  @AdminRoles('finance')
  @Patch('coupons/:id')
  @ZodResponse({ type: AdminCouponDto })
  updateCoupon(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCouponDto,
  ) {
    return this.commerce.updateCoupon(id, user.id, body);
  }

  // ── Payouts ────────────────────────────────────────────────────────────
  @AdminRoles('finance')
  @Get('payouts')
  @ZodResponse({ type: PayoutPageDto })
  payouts(@Query() q: PayoutsQueryDto) {
    return this.commerce.payouts(q);
  }

  @AdminRoles('finance')
  @Post('payouts/run')
  @Idempotent()
  @ZodResponse({ type: RunPayoutsResultDto, status: 200 })
  runPayouts(@CurrentUser() user: AuthUser) {
    return this.ledger.runPayouts(user.id);
  }

  @AdminRoles('finance')
  @Post('payouts/:id/mark-paid')
  @ZodResponse({ type: PayoutPageDto, status: 200 })
  async markPaid(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MarkPaidDto,
  ) {
    await this.ledger.markPayoutPaid(id, body.providerRef, user.id);
    return this.commerce.payouts({ limit: 30 });
  }

  // ── Support ────────────────────────────────────────────────────────────
  @AdminRoles('support', 'ops')
  @Get('tickets')
  @ZodResponse({ type: TicketPageDto })
  tickets(@Query() q: TicketsQueryDto) {
    return this.commerce.tickets(q);
  }

  @AdminRoles('support')
  @Patch('tickets/:id')
  @ZodResponse({ type: TicketDto })
  updateTicket(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateTicketDto,
  ) {
    return this.commerce.updateTicket(id, user.id, body);
  }

  // ── Audit & config ─────────────────────────────────────────────────────
  @AdminRoles('super_admin', 'finance')
  @Get('audit-logs')
  @ZodResponse({ type: AuditPageDto })
  auditLogs(@Query() q: AuditQueryDto) {
    return this.commerce.auditLogs(q);
  }

  @AdminRoles('super_admin')
  @Get('app-config')
  @ZodResponse({ type: AppConfigListDto })
  appConfig() {
    return this.commerce.appConfig();
  }

  @AdminRoles('super_admin')
  @Put('app-config/:key')
  @ZodResponse({ type: AppConfigEntryDto })
  setAppConfig(
    @CurrentUser() user: AuthUser,
    @Param('key') key: string,
    @Body() body: SetAppConfigDto,
  ) {
    return this.commerce.setAppConfig(key, body.value, user.id);
  }
}
