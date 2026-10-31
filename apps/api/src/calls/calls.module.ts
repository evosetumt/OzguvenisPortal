import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat/chat.module';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';

/** Faz 5: WebRTC (eşler arası) sesli/görüntülü arama ve toplantı oturumu; sinyal RealtimeGateway üzerinden. */
@Module({
  imports: [AuthModule, ChatModule],
  controllers: [CallsController],
  providers: [CallsService],
  exports: [CallsService],
})
export class CallsModule {}
