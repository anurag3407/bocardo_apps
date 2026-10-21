import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { AuthGuard } from './common/auth/auth.guard';
import { TokenVerifier } from './common/auth/token-verifier';
import { ConfigModule } from './config/config.module';
import { InfraModule } from './infra/infra.module';
import { AddressesModule } from './modules/addresses/addresses.module';
import { AdminModule } from './modules/admin/admin.module';
import { CallsModule } from './modules/calls/calls.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { DispatchModule } from './modules/dispatch/dispatch.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { FinanceModule } from './modules/finance/finance.module';
import { HealthModule } from './modules/health/health.module';
import { OrdersModule } from './modules/orders/orders.module';
import { OtpModule } from './modules/otp/otp.module';
import { PartnerModule } from './modules/partner/partner.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PromotionsModule } from './modules/promotions/promotions.module';
import { RidersModule } from './modules/riders/riders.module';
import { UsersModule } from './modules/users/users.module';
import { ZonesModule } from './modules/zones/zones.module';
import { PlatformModule } from './platform/platform.module';

/**
 * Modular monolith. Each feature module owns its tables and talks to others through
 * exported services or outbox events — any of them can later become its own service.
 */
@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    InfraModule,
    PlatformModule,
    HealthModule,
    OtpModule,
    UsersModule,
    AddressesModule,
    ZonesModule,
    CatalogModule,
    PromotionsModule,
    OrdersModule,
    PaymentsModule,
    DispatchModule,
    RidersModule,
    PartnerModule,
    FinanceModule,
    FeedbackModule,
    CallsModule,
    AdminModule,
  ],
  providers: [
    TokenVerifier,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
  ],
})
export class AppModule {}
