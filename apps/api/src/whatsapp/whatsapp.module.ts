import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WhatsappController, WhatsappWebhookController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { WhatsappClient } from './whatsapp.client';

/** M10 WhatsApp Business (Cloud API): şablonlu mesaj, izin (opt-in) kaydı, webhook, bildirim kanalı. */
@Module({
  imports: [AuthModule],
  controllers: [WhatsappController, WhatsappWebhookController],
  providers: [WhatsappService, WhatsappClient],
  exports: [WhatsappService],
})
export class WhatsappModule {}
