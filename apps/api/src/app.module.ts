import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { SaveModule } from './save/save.module';
import { PvpModule } from './pvp/pvp.module';

@Module({
  imports: [PrismaModule, AuthModule, SaveModule, PvpModule],
  controllers: [HealthController],
})
export class AppModule {}
