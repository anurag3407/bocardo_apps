import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/decorators';
import { Idempotent } from '../../common/idempotency/idempotent.decorator';
import { RateLimit } from '../../common/rate-limit/rate-limit.guard';
import {
  CancelOrderDto,
  CustomerOrderDto,
  OrderPageDto,
  OrdersQueryDto,
  OrderTrackingDto,
  PaymentSessionSchema,
  PlaceOrderDto,
  PlaceOrderResultDto,
  QuoteDto,
  QuoteRequestDto,
} from './orders.dto';
import { OrdersService } from './orders.service';
import { QuoteService } from './quote.service';

class PaymentSessionDto extends createZodDto(PaymentSessionSchema.clone()) {}

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly quotes: QuoteService,
  ) {}

  /** Server-side pricing of the cart; call whenever the cart, address or coupon changes. */
  @Post('quote')
  @RateLimit(30, 60)
  @ZodResponse({ type: QuoteDto, status: 200 })
  quote(@CurrentUser() user: AuthUser, @Body() body: QuoteRequestDto) {
    return this.quotes.create(user.id, body);
  }

  @Post()
  @Idempotent()
  @RateLimit(10, 60)
  @ZodResponse({ type: PlaceOrderResultDto, status: 201 })
  place(@CurrentUser() user: AuthUser, @Body() body: PlaceOrderDto) {
    return this.orders.place(user.id, body);
  }

  @Get()
  @ZodResponse({ type: OrderPageDto })
  list(@CurrentUser() user: AuthUser, @Query() q: OrdersQueryDto) {
    return this.orders.list(user.id, q.cursor, q.limit);
  }

  @Get(':id')
  @ZodResponse({ type: CustomerOrderDto })
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.detail(user.id, id);
  }

  @Get(':id/tracking')
  @ZodResponse({ type: OrderTrackingDto })
  tracking(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.tracking(user.id, id);
  }

  @Post(':id/payment-session')
  @ZodResponse({ type: PaymentSessionDto, status: 200 })
  paymentSession(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.paymentSession(user.id, id);
  }

  @Post(':id/cancel')
  @Idempotent()
  @ZodResponse({ type: CustomerOrderDto, status: 200 })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CancelOrderDto,
  ) {
    return this.orders.cancelByCustomer(user.id, id, body.reason);
  }
}
