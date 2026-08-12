import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BattleController } from './battle.controller';
import { BattleService } from './battle.service';
import { GameEngineService } from './game-engine.service';

@Module({
  imports: [AuthModule],
  controllers: [BattleController],
  providers: [BattleService, GameEngineService],
  exports: [BattleService, GameEngineService],
})
export class BattleModule {}
