import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Public } from '../../common/auth/decorators';
import { AppError } from '../../common/errors/app-error';
import { RateLimit } from '../../common/rate-limit/rate-limit.guard';
import { ENV, type Env } from '../../config/env';
import { NotificationsService } from '../../platform/notifications/notifications.service';
import { verifyDeploySecret } from './deploy-secret';
import {
  AppConfigDto,
  DeletionRequestDto,
  ProfileDto,
  PublishReleaseDto,
  RegisterDeviceDto,
  UpdateProfileDto,
} from './users.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller()
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
    @Inject(ENV) private readonly env: Env,
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

  /** Public web deletion request (Play Store / App Store compliance for uninstalled users). */
  @Public()
  @Post('public/deletion-request')
  @RateLimit(5, 3600)
  @HttpCode(202)
  async deletionRequest(@Body() body: DeletionRequestDto) {
    await this.users.requestDeletion(body);
    return { accepted: true };
  }

  /** Called by the VPS CI publisher after uploading a new APK to /releases/. */
  @Public()
  @ApiExcludeEndpoint()
  @Post('internal/releases')
  @HttpCode(200)
  publishRelease(
    @Headers('x-deploy-secret') secret: string | undefined,
    @Body() body: PublishReleaseDto,
  ) {
    if (!verifyDeploySecret(secret, this.env.APP_SECRET)) {
      throw AppError.unauthorized('Invalid deploy secret');
    }
    return this.users.publishRelease(body);
  }
}
