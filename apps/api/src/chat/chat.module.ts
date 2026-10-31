import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { RealtimeGateway } from './realtime.gateway';

/** Faz 5: mesajlaşma ve tüm modüllerin kullandığı WebSocket kapısı (RealtimeGateway). */
@Module({
  imports: [AuthModule],
  controllers: [ChatController],
  providers: [ChatService, RealtimeGateway],
  exports: [ChatService, RealtimeGateway],
})
export class ChatModule {}
