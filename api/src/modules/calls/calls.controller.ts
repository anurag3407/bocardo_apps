import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Public } from '../../common/auth/decorators';
import type { AppRequest } from '../../common/http/request-context';
import { CallsService } from './calls.service';

class StartCallDto extends createZodDto(
  z.object({ target: z.enum(['customer', 'rider', 'restaurant']) }),
) {}
class CallResultDto extends createZodDto(
  z.object({
    mode: z.enum(['callback', 'direct']),
    dial: z.string().nullable(),
    message: z.string(),
  }),
) {}

@ApiTags('calls')
@Controller()
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  /** Used by all three apps: the platform rings the caller and bridges to the other party. */
  @ApiBearerAuth()
  @Post('orders/:id/calls')
  @ZodResponse({ type: CallResultDto, status: 200 })
  start(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: StartCallDto,
  ) {
    return this.calls.connect(user.id, id, body.target);
  }

  @Public()
  @ApiExcludeEndpoint()
  @Post('webhooks/telephony/:provider')
  @HttpCode(204)
  async status(
    @Param('provider') provider: string,
    @Query('token') token: string | undefined,
    @Req() request: AppRequest,
  ) {
    await this.calls.recordStatus(provider, token, (request.body ?? {}) as Record<string, string>);
  }
}
