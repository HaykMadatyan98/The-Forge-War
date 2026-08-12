import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat/chat.module';
import { LivePvpService } from './live-pvp.service';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [AuthModule, ChatModule],
  providers: [RealtimeGateway, LivePvpService],
  exports: [LivePvpService],
})
export class RealtimeModule {}
