import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Public } from '../../common/auth/decorators';
import { NotificationsService } from '../../platform/notifications/notifications.service';
import { AppConfigDto, ProfileDto, RegisterDeviceDto, UpdateProfileDto } from './users.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller()
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get('me')
  @ZodResponse({ type: ProfileDto })
  me(@CurrentUser() user: AuthUser) {
    return this.users.getProfile(user.id);
  }

  @Patch('me')
  @ZodResponse({ type: ProfileDto })
  update(@CurrentUser() user: AuthUser, @Body() body: UpdateProfileDto) {
    return this.users.updateProfile(user.id, body);
  }

  @Delete('me')
  @HttpCode(204)
  async deleteAccount(@CurrentUser() user: AuthUser) {
    await this.users.deleteAccount(user.id);
  }

  @Post('me/devices')
  @HttpCode(204)
  async registerDevice(@CurrentUser() user: AuthUser, @Body() body: RegisterDeviceDto) {
    await this.notifications.registerDevice(user.id, body);
  }

  @Delete('me/devices/:token')
  @HttpCode(204)
  async unregisterDevice(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    await this.notifications.unregisterDevice(user.id, token);
  }

  /** Forced-update check + support contacts; called on every app launch. */
  @Public()
  @Get('app-config/:app')
  @ZodResponse({ type: AppConfigDto })
  appConfig(@Param('app') app: 'customer' | 'restaurant' | 'rider') {
    return this.users.appConfig(app);
  }
}
