import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { SaveModule } from './save/save.module';
import { PvpModule } from './pvp/pvp.module';
import { BattleModule } from './battle/battle.module';
import { AdminModule } from './admin/admin.module';
import { FriendsModule } from './friends/friends.module';
import { ChatModule } from './chat/chat.module';
import { RealtimeModule } from './realtime/realtime.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    SaveModule,
    PvpModule,
    BattleModule,
    AdminModule,
    FriendsModule,
    ChatModule,
    RealtimeModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
