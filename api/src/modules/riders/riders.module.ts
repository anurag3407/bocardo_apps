import { Module } from '@nestjs/common';
import { DispatchModule } from '../dispatch/dispatch.module';
import { FinanceModule } from '../finance/finance.module';
import { OrdersModule } from '../orders/orders.module';
import { UsersModule } from '../users/users.module';
import { ZonesModule } from '../zones/zones.module';
import { RidersController } from './riders.controller';
import { RidersService } from './riders.service';
import { TrackingService } from './tracking.service';

@Module({
  imports: [DispatchModule, OrdersModule, UsersModule, ZonesModule, FinanceModule],
  controllers: [RidersController],
  providers: [RidersService, TrackingService],
})
export class RidersModule {}
