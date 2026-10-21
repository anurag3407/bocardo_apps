import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/decorators';
import { RateLimit } from '../../common/rate-limit/rate-limit.guard';
import { CreateTicketDto, RateOrderDto, TicketDto, TicketListDto } from './feedback.dto';
import { FeedbackService } from './feedback.service';

@ApiTags('feedback')
@ApiBearerAuth()
@Controller()
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post('orders/:id/rating')
  @HttpCode(204)
  async rate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RateOrderDto,
  ) {
    await this.feedback.rate(user.id, id, body);
  }

  @Post('support/tickets')
  @RateLimit(10, 3600)
  @ZodResponse({ type: TicketDto, status: 201 })
  createTicket(@CurrentUser() user: AuthUser, @Body() body: CreateTicketDto) {
    return this.feedback.createTicket(user.id, body);
  }

  @Get('support/tickets')
  @ZodResponse({ type: TicketListDto })
  myTickets(@CurrentUser() user: AuthUser) {
    return this.feedback.myTickets(user.id);
  }
}
