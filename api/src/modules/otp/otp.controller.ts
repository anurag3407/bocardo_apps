import { Body, Controller, Headers, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiHeader, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { Public } from '../../common/auth/decorators';
import type { AppRequest } from '../../common/http/request-context';
import { RateLimit } from '../../common/rate-limit/rate-limit.guard';
import { verifyStandardWebhook } from './otp-rules';
import { OtpService } from './otp.service';

class OtpTicketDto extends createZodDto(
  z.object({
    phone: z.string().min(10).max(20),
    /** Web clients: Cloudflare Turnstile token. Mobile apps send App Check in the header instead. */
    turnstileToken: z.string().max(2048).optional(),
  }),
) {}

class OtpTicketResultDto extends createZodDto(
  z.object({ phone: z.string(), expiresInSeconds: z.number().int() }),
) {}

@ApiTags('auth')
@Controller()
export class OtpController {
  constructor(private readonly otp: OtpService) {}

  /** Step 1 of login: prove a genuine app/browser, then request the OTP from Supabase Auth. */
  @Public()
  @Post('auth/otp-ticket')
  @RateLimit(20, 3600)
  @ApiHeader({
    name: 'X-Firebase-AppCheck',
    required: false,
    description: 'Limited-use Firebase App Check token (mobile apps)',
  })
  @ZodResponse({ type: OtpTicketResultDto, status: 200 })
  ticket(
    @Body() body: OtpTicketDto,
    @Req() request: AppRequest,
    @Headers('x-firebase-appcheck') appCheckToken?: string,
  ) {
    return this.otp.issueTicket({
      phone: body.phone,
      turnstileToken: body.turnstileToken,
      appCheckToken,
      ip: request.ip,
    });
  }

  /** Supabase Auth "Send SMS" hook (Standard Webhooks signed). */
  @Public()
  @ApiExcludeEndpoint()
  @Post('webhooks/auth/send-sms')
  @HttpCode(200)
  async sendSmsHook(@Req() request: AppRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const raw = request.rawBody?.toString('utf8') ?? '';
    const secret = this.otp.hookSecret;
    const header = (name: string) => String(request.headers[name] ?? '') || undefined;
    if (
      !secret ||
      !verifyStandardWebhook(
        secret,
        {
          id: header('webhook-id'),
          timestamp: header('webhook-timestamp'),
          signature: header('webhook-signature'),
        },
        raw,
      )
    ) {
      void reply.status(401);
      return { error: { http_code: 401, message: 'invalid hook signature' } };
    }
    const payload = JSON.parse(raw) as { user?: { phone?: string }; sms?: { otp?: string } };
    if (!payload.user?.phone || !payload.sms?.otp) {
      void reply.status(400);
      return { error: { http_code: 400, message: 'malformed payload' } };
    }
    const result = await this.otp.deliverFromHook(payload.user.phone, payload.sms.otp);
    if (!result.sent) {
      // surfaces to the client as a failed OTP request — the app re-requests a ticket
      void reply.status(403);
      return { error: { http_code: 403, message: result.reason } };
    }
    return {};
  }
}
