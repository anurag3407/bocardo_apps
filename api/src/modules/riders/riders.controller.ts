import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { Idempotent } from '../../common/idempotency/idempotent.decorator';
import { RateLimit } from '../../common/rate-limit/rate-limit.guard';
import { EarningsDto, EarningsQueryDto, istRange } from '../finance/finance.dto';
import { LedgerService } from '../finance/ledger.service';
import {
  ActiveRiderOrderDto,
  CurrentOfferDto,
  DeliverDto,
  GoOnlineDto,
  LocationAckDto,
  LocationBatchDto,
  RejectOfferDto,
  RiderApplyDto,
  RiderHistoryQueryDto,
  RiderOrderDto,
  RiderOrderPageDto,
  RiderProfileDto,
  SosDto,
  UndeliverableDto,
} from './riders.dto';
import { RidersService } from './riders.service';
import { TrackingService } from './tracking.service';

@ApiTags('rider')
@ApiBearerAuth()
@Controller('rider')
export class RidersController {
  constructor(
    private readonly riders: RidersService,
    private readonly tracking: TrackingService,
    private readonly ledger: LedgerService,
  ) {}

  /** Onboarding: any signed-in user can apply; the rider role is granted immediately, KYC gates going online. */
  @Post('apply')
  @ZodResponse({ type: RiderProfileDto, status: 201 })
  apply(@CurrentUser() user: AuthUser, @Body() body: RiderApplyDto) {
    return this.riders.apply(user.id, body);
  }

  @Roles('rider')
  @Get('me')
  @ZodResponse({ type: RiderProfileDto })
  me(@CurrentUser() user: AuthUser) {
    return this.riders.profile(user.id);
  }

  @Roles('rider')
  @Post('online')
  @ZodResponse({ type: RiderProfileDto, status: 200 })
  online(@CurrentUser() user: AuthUser, @Body() body: GoOnlineDto) {
    return this.riders.goOnline(user.id, body.lat, body.lng);
  }

  @Roles('rider')
  @Post('offline')
  @ZodResponse({ type: RiderProfileDto, status: 200 })
  offline(@CurrentUser() user: AuthUser) {
    return this.riders.goOffline(user.id);
  }

  @Roles('rider')
  @Post('location')
  @RateLimit(60, 60)
  @ZodResponse({ type: LocationAckDto, status: 200 })
  location(@CurrentUser() user: AuthUser, @Body() body: LocationBatchDto) {
    return this.tracking.ingest(user.id, body);
  }

  @Roles('rider')
  @Get('offers/current')
  @ZodResponse({ type: CurrentOfferDto })
  currentOffer(@CurrentUser() user: AuthUser) {
    return this.riders.currentOffer(user.id);
  }

  @Roles('rider')
  @Post('offers/:id/accept')
  @Idempotent()
  @ZodResponse({ type: RiderOrderDto, status: 200 })
  accept(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.riders.acceptOffer(user.id, id);
  }

  @Roles('rider')
  @Post('offers/:id/reject')
  @HttpCode(204)
  async reject(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RejectOfferDto,
  ) {
    await this.riders.rejectOffer(user.id, id, body.reason);
  }

  @Roles('rider')
  @Get('orders/active')
  @ZodResponse({ type: ActiveRiderOrderDto })
  active(@CurrentUser() user: AuthUser) {
    return this.riders.activeOrder(user.id);
  }

  @Roles('rider')
  @Get('orders')
  @ZodResponse({ type: RiderOrderPageDto })
  history(@CurrentUser() user: AuthUser, @Query() q: RiderHistoryQueryDto) {
    return this.riders.history(user.id, q.cursor, q.limit);
  }

  @Roles('rider')
  @Post('orders/:id/arrived-restaurant')
  @Idempotent()
  @ZodResponse({ type: RiderOrderDto, status: 200 })
  arrivedRestaurant(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.riders.arrivedAtRestaurant(user.id, id);
  }

  @Roles('rider')
  @Post('orders/:id/picked-up')
  @Idempotent()
  @ZodResponse({ type: RiderOrderDto, status: 200 })
  pickedUp(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.riders.pickedUp(user.id, id);
  }

  @Roles('rider')
  @Post('orders/:id/arrived-drop')
  @Idempotent()
  @ZodResponse({ type: RiderOrderDto, status: 200 })
  arrivedDrop(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.riders.arrivedAtDrop(user.id, id);
  }

  @Roles('rider')
  @Post('orders/:id/deliver')
  @Idempotent()
  @RateLimit(10, 300)
  @ZodResponse({ type: RiderOrderDto, status: 200 })
  deliver(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: DeliverDto,
  ) {
    return this.riders.deliver(user.id, id, body.otp);
  }

  @Roles('rider')
  @Post('orders/:id/undeliverable')
  @Idempotent()
  @ZodResponse({ type: RiderOrderDto, status: 200 })
  undeliverable(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UndeliverableDto,
  ) {
    return this.riders.undeliverable(user.id, id, body.reason);
  }

  @Roles('rider')
  @Get('earnings')
  @ZodResponse({ type: EarningsDto })
  earnings(@CurrentUser() user: AuthUser, @Query() q: EarningsQueryDto) {
    const [from, to] = istRange(q.from, q.to);
    return this.ledger.earnings('rider', user.id, from, to);
  }

  @Roles('rider')
  @Post('sos')
  @HttpCode(204)
  async sos(@CurrentUser() user: AuthUser, @Body() body: SosDto) {
    await this.riders.sos(user.id, body);
  }
}
