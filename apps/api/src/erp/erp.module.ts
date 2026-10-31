import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CalendarModule } from '../calendar/calendar.module';
import { ErpController } from './erp.controller';
import { ErpService } from './erp.service';
import { ErpSyncService } from './erp-sync.service';
import { ErpScope } from './erp-scope';
import { NetsisClient } from './netsis.client';
import { EDocumentService } from './edocument.service';

/** Faz 2: Netsis salt okunur entegrasyonu (önbellek senkronu, raporlar, iş emri otomatik kapanışı, e-belge önizleme). */
@Module({
  imports: [AuthModule, CalendarModule],
  controllers: [ErpController],
  providers: [NetsisClient, ErpScope, ErpSyncService, ErpService, EDocumentService],
  exports: [ErpService, ErpScope],
})
export class ErpModule {}
