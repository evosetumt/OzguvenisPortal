import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { EventsModule } from './events/events.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { TasksModule } from './tasks/tasks.module';
import { CalendarModule } from './calendar/calendar.module';
import { PushModule } from './push/push.module';
import { ReportsModule } from './reports/reports.module';
import { ErpModule } from './erp/erp.module';
import { WorkflowModule } from './workflow/workflow.module';
import { ExpensesModule } from './expenses/expenses.module';
import { TrackingModule } from './tracking/tracking.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { ChatModule } from './chat/chat.module';
import { MeetingsModule } from './meetings/meetings.module';
import { CallsModule } from './calls/calls.module';
import { PaymentsModule } from './payments/payments.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    EventsModule,
    AuthModule,
    UsersModule,
    NotificationsModule,
    AttachmentsModule,
    TasksModule,
    CalendarModule,
    PushModule,          // Faz 1: Firebase Cloud Messaging, e-posta kanalları
    ReportsModule,       // Faz 1: görev analizleri
    ErpModule,           // Faz 2: Netsis okuma
    WorkflowModule,      // Faz 3: BPMN motoru
    ExpensesModule,      // Faz 3: masraf
    TrackingModule,      // Faz 4: süre takibi, araçlar
    WhatsappModule,      // Faz 4: WhatsApp Business
    ChatModule,          // Faz 5: mesajlaşma + WebSocket
    CallsModule,         // Faz 5: WebRTC sesli/görüntülü arama
    MeetingsModule,      // Faz 5: toplantı (WebRTC oturumu CallsModule'den)
    PaymentsModule,      // Ödeme takibi: çek, kredi kartı, vergi/SGK → görev
  ],
  controllers: [HealthController],
})
export class AppModule {}
