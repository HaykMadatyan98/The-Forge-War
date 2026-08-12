import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { extractSessionToken } from '../auth/session-cookie';
import { PvpService } from './pvp.service';

@Controller('pvp')
export class PvpController {
  constructor(
    private readonly pvp: PvpService,
    private readonly auth: AuthService,
  ) {}

  private async needPlayer(req: Request) {
    const player = await this.auth.playerFromToken(extractSessionToken(req));
    if (!player) throw new UnauthorizedException('unauthorized');
    return player;
  }

  @Put('defense')
  async putDefense(@Req() req: Request) {
    const player = await this.needPlayer(req);
    return this.pvp.upsertDefense(player);
  }

  @Get('opponents')
  async opponents(
    @Req() req: Request,
    @Query('limit') limit?: string,
    @Query('myPower') myPower?: string,
  ) {
    const player = await this.needPlayer(req);
    const n = Math.min(20, Math.max(1, Number(limit) || 8));
    const power = Number(myPower);
    return this.pvp.listOpponents(player.id, n, Number.isFinite(power) ? power : undefined);
  }

  @Get('me')
  async me(@Req() req: Request) {
    const player = await this.needPlayer(req);
    return this.pvp.myDefense(player.id);
  }

  @Post('challenge')
  async challenge(@Req() req: Request, @Body() body: { opponentId?: string }) {
    const player = await this.needPlayer(req);
    if (!body?.opponentId) throw new BadRequestException('missing_opponent');
    return this.pvp.openChallenge(player.id, String(body.opponentId));
  }

  @Post('result')
  async result(
    @Req() req: Request,
    @Body() body: { matchId?: string; victory?: boolean },
  ) {
    const player = await this.needPlayer(req);
    if (!body?.matchId) throw new BadRequestException('missing_match');
    return this.pvp.recordResult(player.id, String(body.matchId), !!body.victory);
  }
}
