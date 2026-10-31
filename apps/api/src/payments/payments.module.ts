import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CalendarModule } from '../calendar/calendar.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentSchedulerService } from './payment-scheduler.service';

/** Ödeme takibi: çek, kurumsal kredi kartı, kredi taksiti, vergi/SGK... vadesinden önce birim yöneticisine görev. */
@Module({
  imports: [AuthModule, CalendarModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentSchedulerService],
})
export class PaymentsModule {}
