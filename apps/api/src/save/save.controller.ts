import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { extractSessionToken } from '../auth/session-cookie';
import { SaveBlob, SaveService } from './save.service';

@Controller()
export class SaveController {
  constructor(
    private readonly saves: SaveService,
    private readonly auth: AuthService,
  ) {}

  private async needPlayer(req: Request) {
    const player = await this.auth.playerFromToken(extractSessionToken(req));
    if (!player) throw new UnauthorizedException('unauthorized');
    return player;
  }

  @Get('player/save')
  async getPlayerSave(@Req() req: Request) {
    const player = await this.needPlayer(req);
    return { save: await this.saves.getByPlayer(player.id), playerId: player.id };
  }

  @Put('player/save')
  @Post('player/save')
  async putPlayerSave(@Req() req: Request, @Body() body: SaveBlob) {
    const player = await this.needPlayer(req);
    const result = await this.saves.putPlayer(player.id, body ?? {});
    if ('conflict' in result && result.conflict) {
      this.saves.throwConflict(result);
    }
    return result;
  }
}
