import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { DispatchConfigService } from './dispatch-config.service';
import { DispatchHandlers } from './dispatch.handlers';
import { DispatchService } from './dispatch.service';
import { RiderPool } from './rider-pool.service';

@Module({
  imports: [OrdersModule],
  providers: [DispatchService, DispatchHandlers, RiderPool, DispatchConfigService],
  exports: [DispatchService, RiderPool],
})
export class DispatchModule {}
