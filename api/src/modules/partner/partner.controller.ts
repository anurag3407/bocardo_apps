import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { Idempotent } from '../../common/idempotency/idempotent.decorator';
import { EarningsDto, EarningsQueryDto, istRange } from '../finance/finance.dto';
import { LedgerService } from '../finance/ledger.service';
import {
  AcceptOrderDto,
  CreateCategoryDto,
  CreateItemDto,
  ExtendPrepDto,
  ItemOptionsDto,
  PartnerCancelDto,
  PartnerMenuDto,
  PartnerOrderDto,
  PartnerOrderListDto,
  PartnerOrdersQueryDto,
  PartnerRestaurantDto,
  PartnerRestaurantListDto,
  RejectOrderDto,
  RestaurantApplyDto,
  SetBusyDto,
  SetHoursDto,
  SetOpenDto,
  SetStockDto,
  UpdateCategoryDto,
  UpdateItemDto,
  UpdateRestaurantDto,
} from './partner.dto';
import { PartnerOrdersService } from './partner-orders.service';
import { PartnerRestaurantService } from './partner-restaurant.service';
import { RestaurantAccess } from './restaurant-access.service';

const ManagerUp = ['owner', 'manager'] as const;

@ApiTags('partner')
@ApiBearerAuth()
@Controller('partner')
export class PartnerController {
  constructor(
    private readonly restaurants: PartnerRestaurantService,
    private readonly orders: PartnerOrdersService,
    private readonly access: RestaurantAccess,
    private readonly ledger: LedgerService,
  ) {}

  @Post('apply')
  @ZodResponse({ type: PartnerRestaurantDto, status: 201 })
  apply(@CurrentUser() user: AuthUser, @Body() body: RestaurantApplyDto) {
    return this.restaurants.apply(user.id, body);
  }

  @Roles('restaurant')
  @Get('restaurants')
  @ZodResponse({ type: PartnerRestaurantListDto })
  list(@CurrentUser() user: AuthUser) {
    return this.restaurants.list(user.id);
  }

  @Roles('restaurant')
  @Get('restaurants/:rid')
  @ZodResponse({ type: PartnerRestaurantDto })
  get(@CurrentUser() user: AuthUser, @Param('rid', ParseUUIDPipe) rid: string) {
    return this.restaurants.get(user.id, rid);
  }

  @Roles('restaurant')
  @Patch('restaurants/:rid')
  @ZodResponse({ type: PartnerRestaurantDto })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('rid', ParseUUIDPipe) rid: string,
    @Body() body: UpdateRestaurantDto,
  ) {
    await this.access.assert(user.id, rid, [...ManagerUp]);
    return this.restaurants.update(user.id, rid, body);
  }

  @Roles('restaurant')
  @Post('restaurants/:rid/open')
  @ZodResponse({ type: PartnerRestaurantDto, status: 200 })
  async setOpen(
    @CurrentUser() user: AuthUser,
    @Param('rid', ParseUUIDPipe) rid: string,
    @Body() body: SetOpenDto,
  ) {
    await this.access.assert(user.id, rid);
    return this.restaurants.setOpen(user.id, rid, body.isOpen);
  }

  @Roles('restaurant')
  @Post('restaurants/:rid/busy')
  @ZodResponse({ type: PartnerRestaurantDto, status: 200 })
  async setBusy(
    @CurrentUser() user: AuthUser,
    @Param('rid', ParseUUIDPipe) rid: string,
    @Body() body: SetBusyDto,
  ) {
    await this.access.assert(user.id, rid);
    return this.restaurants.setBusy(user.id, rid, body.minutes);
  }

  @Roles('restaurant')
  @Put('restaurants/:rid/hours')
  @ZodResponse({ type: PartnerRestaurantDto })
  async setHours(
    @CurrentUser() user: AuthUser,
    @Param('rid', ParseUUIDPipe) rid: string,
    @Body() body: SetHoursDto,
  ) {
    await this.access.assert(user.id, rid, [...ManagerUp]);
    return this.restaurants.setHours(user.id, rid, body);
  }

  @Roles('restaurant')
  @Post('restaurants/:rid/heartbeat')
  @HttpCode(204)
  async heartbeat(@CurrentUser() user: AuthUser, @Param('rid', ParseUUIDPipe) rid: string) {
    await this.access.assert(user.id, rid);
    await this.restaurants.heartbeat(rid);
  }

  // ── Menu ────────────────────────────────────────────────────────────────
  @Roles('restaurant')
  @Get('restaurants/:rid/menu')
  @ZodResponse({ type: PartnerMenuDto })
  async menu(@CurrentUser() user: AuthUser, @Param('rid', ParseUUIDPipe) rid: string) {
    await this.access.assert(user.id, rid);
    return this.restaurants.menu(rid);
  }

  @Roles('restaurant')
  @Post('restaurants/:rid/menu/categories')
  @ZodResponse({ type: PartnerMenuDto, status: 201 })
  async createCategory(
    @CurrentUser() user: AuthUser,
    @Param('rid', ParseUUIDPipe) rid: string,
    @Body() body: CreateCategoryDto,
  ) {
    await this.access.assert(user.id, rid, [...ManagerUp]);
    return this.restaurants.createCategory(rid, body);
  }

  @Roles('restaurant')
  @Patch('restaurants/:rid/menu/categories/:cid')
  @ZodResponse({ type: PartnerMenuDto })
  async updateCategory(
    @CurrentUser() user: AuthUser,
    @Param('rid', ParseUUIDPipe) rid: string,
    @Param('cid', ParseUUIDPipe) cid: string,
    @Body() body: UpdateCategoryDto,
  ) {
    await this.access.assert(user.id, rid, [...ManagerUp]);
    return this.restaurants.updateCategory(rid, cid, body);
  }

  @Roles('restaurant')
  @Post('restaurants/:rid/menu/items')
  @ZodResponse({ type: PartnerMenuDto, status: 201 })
  async createItem(
    @CurrentUser() user: AuthUser,
    @Param('rid', ParseUUIDPipe) rid: string,
    @Body() body: CreateItemDto,
  ) {
    await this.access.assert(user.id, rid, [...ManagerUp]);
    return this.restaurants.createItem(rid, body);
  }

  @Roles('restaurant')
  @Patch('restaurants/:rid/menu/items/:iid')
  @ZodResponse({ type: PartnerMenuDto })
  async updateItem(
    @CurrentUser() user: AuthUser,
    @Param('rid', ParseUUIDPipe) rid: string,
    @Param('iid', ParseUUIDPipe) iid: string,
    @Body() body: UpdateItemDto,
  ) {
    await this.access.assert(user.id, rid, [...ManagerUp]);
    return this.restaurants.updateItem(rid, iid, body);
  }

  @Roles('restaurant')
  @Put('restaurants/:rid/menu/items/:iid/options')
  @ZodResponse({ type: PartnerMenuDto })
  async setItemOptions(
    @CurrentUser() user: AuthUser,
    @Param('rid', ParseUUIDPipe) rid: string,
    @Param('iid', ParseUUIDPipe) iid: string,
    @Body() body: ItemOptionsDto,
  ) {
    await this.access.assert(user.id, rid, [...ManagerUp]);
    return this.restaurants.setItemOptions(rid, iid, body);
  }

  /** Staff can toggle stock — it is the most frequent action during service. */
  @Roles('restaurant')
  @Post('restaurants/:rid/menu/stock')
  @ZodResponse({ type: PartnerMenuDto, status: 200 })
  async setStock(
    @CurrentUser() user: AuthUser,
    @Param('rid', ParseUUIDPipe) rid: string,
    @Body() body: SetStockDto,
  ) {
    await this.access.assert(user.id, rid);
    return this.restaurants.setStock(rid, body);
  }

  // ── Orders ──────────────────────────────────────────────────────────────
  @Roles('restaurant')
  @Get('restaurants/:rid/orders')
  @ZodResponse({ type: PartnerOrderListDto })
  async listOrders(
    @CurrentUser() user: AuthUser,
    @Param('rid', ParseUUIDPipe) rid: string,
    @Query() q: PartnerOrdersQueryDto,
  ) {
    await this.access.assert(user.id, rid);
    return this.orders.list(rid, q.scope, q.cursor, q.limit);
  }

  @Roles('restaurant')
  @Get('restaurants/:rid/orders/:oid')
  @ZodResponse({ type: PartnerOrderDto })
  async order(
    @CurrentUser() user: AuthUser,
    @Param('rid', ParseUUIDPipe) rid: string,
    @Param('oid', ParseUUIDPipe) oid: string,
  ) {
    await this.access.assert(user.id, rid);
    return this.orders.view(rid, oid);
  }

  @Roles('restaurant')
  @Post('restaurants/:rid/orders/:oid/accept')
  @Idempotent()
  @ZodResponse({ type: PartnerOrderDto, status: 200 })
  async accept(
    @CurrentUser() user: AuthUser,
    @Param('rid', ParseUUIDPipe) rid: string,
    @Param('oid', ParseUUIDPipe) oid: string,
    @Body() body: AcceptOrderDto,
  ) {
    await this.access.assert(user.id, rid);
    return this.orders.accept(rid, user.id, oid, body.prepMinutes);
  }

  @Roles('restaurant')
  @Post('restaurants/:rid/orders/:oid/reject')
  @Idempotent()
  @ZodResponse({ type: PartnerOrderDto, status: 200 })
  async reject(
    @CurrentUser() user: AuthUser,
    @Param('rid', ParseUUIDPipe) rid: string,
    @Param('oid', ParseUUIDPipe) oid: string,
    @Body() body: RejectOrderDto,
  ) {
    await this.access.assert(user.id, rid);
    return this.orders.reject(rid, user.id, oid, body);
  }

  @Roles('restaurant')
  @Post('restaurants/:rid/orders/:oid/ready')
  @Idempotent()
  @ZodResponse({ type: PartnerOrderDto, status: 200 })
  async ready(
    @CurrentUser() user: AuthUser,
    @Param('rid', ParseUUIDPipe) rid: string,
    @Param('oid', ParseUUIDPipe) oid: string,
  ) {
    await this.access.assert(user.id, rid);
    return this.orders.markReady(rid, user.id, oid);
  }

  @Roles('restaurant')
  @Post('restaurants/:rid/orders/:oid/extend-prep')
  @Idempotent()
  @ZodResponse({ type: PartnerOrderDto, status: 200 })
  async extendPrep(
    @CurrentUser() user: AuthUser,
    @Param('rid', ParseUUIDPipe) rid: string,
    @Param('oid', ParseUUIDPipe) oid: string,
    @Body() body: ExtendPrepDto,
  ) {
    await this.access.assert(user.id, rid);
    return this.orders.extendPrep(rid, user.id, oid, body.extraMinutes);
  }

  @Roles('restaurant')
  @Post('restaurants/:rid/orders/:oid/cancel')
  @Idempotent()
  @ZodResponse({ type: PartnerOrderDto, status: 200 })
  async cancel(
    @CurrentUser() user: AuthUser,
    @Param('rid', ParseUUIDPipe) rid: string,
    @Param('oid', ParseUUIDPipe) oid: string,
    @Body() body: PartnerCancelDto,
  ) {
    await this.access.assert(user.id, rid, [...ManagerUp]);
    return this.orders.cancel(rid, user.id, oid, body.reason);
  }

  @Roles('restaurant')
  @Get('restaurants/:rid/earnings')
  @ZodResponse({ type: EarningsDto })
  async earnings(
    @CurrentUser() user: AuthUser,
    @Param('rid', ParseUUIDPipe) rid: string,
    @Query() q: EarningsQueryDto,
  ) {
    await this.access.assert(user.id, rid, [...ManagerUp]);
    const [from, to] = istRange(q.from, q.to);
    return this.ledger.earnings('restaurant', rid, from, to);
  }
}
