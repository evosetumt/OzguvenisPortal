import { Module, OnModuleInit } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsService } from '../notifications/notifications.service';
import { PushService } from './push.service';
import { EmailService } from './email.service';
import { PushController } from './push.controller';
import { MailController } from './mail.controller';

/** Bildirim kanalları: push (Firebase Cloud Messaging: web, Android, iOS) ve e-posta. Ortam değişkenleri yoksa kanal "yapılandırılmamış" görünür. */
@Module({
  imports: [AuthModule],
  controllers: [PushController, MailController],
  providers: [PushService, EmailService],
  exports: [PushService],
})
export class PushModule implements OnModuleInit {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly push: PushService,
    private readonly email: EmailService,
  ) {}

  onModuleInit() {
    this.notifications.registerChannel('push', this.push);
    this.notifications.registerChannel('email', this.email);
  }
}
