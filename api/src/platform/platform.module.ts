import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit/audit.service';
import { AppConfigService } from './config/app-config.service';
import { NotificationsService } from './notifications/notifications.service';
import { OutboxProcessor } from './outbox/outbox.processor';
import { OutboxRegistry } from './outbox/outbox.registry';
import { OutboxService } from './outbox/outbox.service';

/** Cross-cutting application services every domain module may use. */
@Global()
@Module({
  providers: [
    OutboxService,
    OutboxRegistry,
    OutboxProcessor,
    NotificationsService,
    AuditService,
    AppConfigService,
  ],
  exports: [
    OutboxService,
    OutboxRegistry,
    OutboxProcessor,
    NotificationsService,
    AuditService,
    AppConfigService,
  ],
})
export class PlatformModule {}
