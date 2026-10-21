import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { FinanceModule } from '../finance/finance.module';
import { OrdersModule } from '../orders/orders.module';
import { UsersModule } from '../users/users.module';
import { ZonesModule } from '../zones/zones.module';
import { PartnerController } from './partner.controller';
import { PartnerOrdersService } from './partner-orders.service';
import { PartnerRestaurantService } from './partner-restaurant.service';
import { RestaurantAccess } from './restaurant-access.service';

@Module({
  imports: [CatalogModule, OrdersModule, UsersModule, ZonesModule, FinanceModule],
  controllers: [PartnerController],
  providers: [PartnerRestaurantService, PartnerOrdersService, RestaurantAccess],
})
export class PartnerModule {}
