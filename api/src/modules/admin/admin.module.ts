import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { FinanceModule } from '../finance/finance.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { AdminAccountsController } from './admin-accounts.controller';
import { AdminAccountsService } from './admin-accounts.service';
import { AdminCommerceService } from './admin-commerce.service';
import { AdminGeoService } from './admin-geo.service';
import { AdminOpsController } from './admin-ops.controller';
import { AdminOpsService } from './admin-ops.service';
import { AdminPlatformController } from './admin-platform.controller';

@Module({
  imports: [OrdersModule, DispatchModule, PaymentsModule, FinanceModule, CatalogModule],
  controllers: [AdminOpsController, AdminAccountsController, AdminPlatformController],
  providers: [AdminOpsService, AdminAccountsService, AdminGeoService, AdminCommerceService],
})
export class AdminModule {}
