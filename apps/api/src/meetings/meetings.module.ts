import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CalendarModule } from '../calendar/calendar.module';
import { ChatModule } from '../chat/chat.module';
import { TasksModule } from '../tasks/tasks.module';
import { CallsModule } from '../calls/calls.module';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';

/** Faz 5: görüntülü toplantı (planlama, takvim yansıması, WebRTC oturumu, kişisel notlar, toplantıdan görev). */
@Module({
  imports: [AuthModule, CalendarModule, ChatModule, TasksModule, CallsModule],
  controllers: [MeetingsController],
  providers: [MeetingsService],
})
export class MeetingsModule {}
