import { Module } from '@nestjs/common';
import { ZonesModule } from '../zones/zones.module';
import { CatalogCache } from './catalog.cache';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { MenuRepository } from './menu.repository';

@Module({
  imports: [ZonesModule],
  controllers: [CatalogController],
  providers: [CatalogService, MenuRepository, CatalogCache],
  exports: [CatalogService, MenuRepository, CatalogCache],
})
export class CatalogModule {}
