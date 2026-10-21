import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { AdminRoles, CurrentUser, Roles } from '../../common/auth/decorators';
import { LedgerService } from '../finance/ledger.service';
import {
  AdminRestaurantDto,
  AdminRestaurantPageDto,
  AdminRestaurantsQueryDto,
  AdminRiderDto,
  AdminRiderPageDto,
  AdminRidersQueryDto,
  AdminUserPageDto,
  AdminUsersQueryDto,
  BlockUserDto,
  CashDepositDto,
  GrantAdminDto,
  RestaurantStatusDto,
  RestaurantTermsDto,
  RiderKycDto,
} from './admin.dto';
import { AdminAccountsService } from './admin-accounts.service';

class GrantAdminResultDto extends createZodDto(
  z.object({ userId: z.string(), adminRole: z.string().nullable() }),
) {}

@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin')
export class AdminAccountsController {
  constructor(
    private readonly accounts: AdminAccountsService,
    private readonly ledger: LedgerService,
  ) {}

  @AdminRoles('ops', 'support', 'finance')
  @Get('restaurants')
  @ZodResponse({ type: AdminRestaurantPageDto })
  restaurants(@Query() q: AdminRestaurantsQueryDto) {
    return this.accounts.restaurants(q);
  }

  @AdminRoles('ops', 'support', 'finance')
  @Get('restaurants/:id')
  @ZodResponse({ type: AdminRestaurantDto })
  restaurant(@Param('id', ParseUUIDPipe) id: string) {
    return this.accounts.restaurant(id);
  }

  @AdminRoles('ops')
  @Post('restaurants/:id/status')
  @ZodResponse({ type: AdminRestaurantDto, status: 200 })
  setRestaurantStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RestaurantStatusDto,
  ) {
    return this.accounts.setRestaurantStatus(id, user.id, body);
  }

  @AdminRoles('ops', 'finance')
  @Patch('restaurants/:id/terms')
  @ZodResponse({ type: AdminRestaurantDto })
  setRestaurantTerms(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RestaurantTermsDto,
  ) {
    return this.accounts.setRestaurantTerms(id, user.id, body);
  }

  @AdminRoles('ops', 'support', 'finance')
  @Get('riders')
  @ZodResponse({ type: AdminRiderPageDto })
  riders(@Query() q: AdminRidersQueryDto) {
    return this.accounts.riders(q);
  }

  @AdminRoles('ops', 'support', 'finance')
  @Get('riders/:id')
  @ZodResponse({ type: AdminRiderDto })
  rider(@Param('id', ParseUUIDPipe) id: string) {
    return this.accounts.rider(id);
  }

  @AdminRoles('ops')
  @Post('riders/:id/kyc')
  @ZodResponse({ type: AdminRiderDto, status: 200 })
  setRiderKyc(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RiderKycDto,
  ) {
    return this.accounts.setRiderKyc(id, user.id, body);
  }

  @AdminRoles('finance', 'ops')
  @Post('riders/:id/cash-deposit')
  @ZodResponse({ type: AdminRiderDto, status: 200 })
  async cashDeposit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CashDepositDto,
  ) {
    await this.ledger.recordCashDeposit(id, body.amountPaise, user.id);
    return this.accounts.rider(id);
  }

  @AdminRoles('support', 'ops')
  @Get('users')
  @ZodResponse({ type: AdminUserPageDto })
  users(@Query() q: AdminUsersQueryDto) {
    return this.accounts.users(q);
  }

  @AdminRoles('support', 'ops')
  @Post('users/:id/block')
  @HttpCode(204)
  async block(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: BlockUserDto,
  ) {
    await this.accounts.setBlocked(id, user.id, body.blocked, body.reason);
  }

  @AdminRoles('super_admin')
  @Post('admins')
  @ZodResponse({ type: GrantAdminResultDto, status: 200 })
  grantAdmin(@CurrentUser() user: AuthUser, @Body() body: GrantAdminDto) {
    return this.accounts.grantAdmin(user.id, body);
  }
}
