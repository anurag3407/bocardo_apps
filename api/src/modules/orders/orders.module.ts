import { Module } from '@nestjs/common';
import { AddressesModule } from '../addresses/addresses.module';
import { CatalogModule } from '../catalog/catalog.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { ZonesModule } from '../zones/zones.module';
import { OrderNotifier } from './order-notifier';
import { OrderReader } from './order-reader.service';
import { OrderWorkflow } from './order-workflow.service';
import { OrdersController } from './orders.controller';
import { OrdersJobs } from './orders.jobs';
import { OrdersService } from './orders.service';
import { QuoteService } from './quote.service';

@Module({
  imports: [CatalogModule, AddressesModule, ZonesModule, PromotionsModule],
  controllers: [OrdersController],
  providers: [OrdersService, QuoteService, OrderWorkflow, OrderReader, OrderNotifier, OrdersJobs],
  exports: [OrderWorkflow, OrderReader, OrdersService],
})
export class OrdersModule {}
