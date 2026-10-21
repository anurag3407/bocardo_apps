import { Body, Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Public } from '../../common/auth/decorators';
import type { AppRequest } from '../../common/http/request-context';
import { CustomerOrderDto } from '../orders/orders.dto';
import { PaymentsService } from './payments.service';

class VerifyPaymentDto extends createZodDto(
  z.object({
    orderId: z.uuid(),
    providerOrderId: z.string().min(1),
    providerPaymentId: z.string().min(1),
    signature: z.string().min(1),
  }),
) {}

@ApiTags('payments')
@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @ApiBearerAuth()
  @Post('payments/verify')
  @ZodResponse({ type: CustomerOrderDto, status: 200 })
  verify(@CurrentUser() user: AuthUser, @Body() body: VerifyPaymentDto) {
    return this.payments.verifyFromClient(user.id, body);
  }

  @Public()
  @ApiExcludeEndpoint()
  @Post('webhooks/razorpay')
  @HttpCode(200)
  async razorpayWebhook(
    @Req() request: AppRequest,
    @Headers('x-razorpay-signature') signature: string,
    @Headers('x-razorpay-event-id') eventId?: string,
  ) {
    await this.payments.handleWebhook(
      request.rawBody?.toString('utf8') ?? '',
      signature ?? '',
      eventId,
    );
    return { ok: true };
  }
}
