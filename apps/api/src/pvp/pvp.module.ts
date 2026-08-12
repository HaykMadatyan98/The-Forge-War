import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BattleModule } from '../battle/battle.module';
import { PvpController } from './pvp.controller';
import { PvpService } from './pvp.service';

@Module({
  imports: [AuthModule, BattleModule],
  controllers: [PvpController],
  providers: [PvpService],
  exports: [PvpService],
})
export class PvpModule {}
