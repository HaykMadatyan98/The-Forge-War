import { Body, Controller, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { extractSessionToken } from '../auth/session-cookie';
import { BattleService } from './battle.service';

@Controller('battle')
export class BattleController {
  constructor(
    private readonly battle: BattleService,
    private readonly auth: AuthService,
  ) {}

  private async needPlayer(req: Request) {
    const player = await this.auth.playerFromToken(extractSessionToken(req));
    if (!player) throw new UnauthorizedException('unauthorized');
    return player;
  }

  @Post('simulate-pvp')
  async simulatePvp(@Req() req: Request, @Body() body: Parameters<BattleService['simulatePvp']>[0]) {
    await this.needPlayer(req);
    return this.battle.simulatePvp(body);
  }
}
