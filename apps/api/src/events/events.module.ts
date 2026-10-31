import { Global, Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { AuditService } from '../common/audit.service';
import { SettingsService } from '../common/settings.service';

@Global()
@Module({
  providers: [EventsService, AuditService, SettingsService],
  exports: [EventsService, AuditService, SettingsService],
})
export class EventsModule {}
