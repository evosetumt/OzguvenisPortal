import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CalendarModule } from '../calendar/calendar.module';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';
import { TrackingReminderService } from './tracking-reminder.service';

/** M7 Abonelik ve süre takibi: sigorta, muayene, bakım, taahhüt, sözleşme, kira + araçlar. */
@Module({
  imports: [AuthModule, CalendarModule],
  controllers: [TrackingController],
  providers: [TrackingService, TrackingReminderService],
})
export class TrackingModule {}
