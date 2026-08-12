import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { extractSessionToken } from '../auth/session-cookie';
import { FriendsService } from './friends.service';

@Controller('friends')
export class FriendsController {
  constructor(
    private readonly friends: FriendsService,
    private readonly auth: AuthService,
  ) {}

  private async needPlayer(req: Request) {
    const player = await this.auth.playerFromToken(extractSessionToken(req));
    if (!player) throw new UnauthorizedException('unauthorized');
    return player;
  }

  @Get()
  async list(@Req() req: Request) {
    const player = await this.needPlayer(req);
    return this.friends.list(player.id);
  }

  @Get('pending')
  async pending(@Req() req: Request) {
    const player = await this.needPlayer(req);
    return this.friends.pending(player.id);
  }

  @Post('request')
  async request(@Req() req: Request, @Body() body: { playerId?: string }) {
    const player = await this.needPlayer(req);
    return this.friends.request(player.id, String(body?.playerId || ''));
  }

  @Post(':id/accept')
  async accept(@Req() req: Request, @Param('id') id: string) {
    const player = await this.needPlayer(req);
    return this.friends.accept(player.id, id);
  }

  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    const player = await this.needPlayer(req);
    return this.friends.remove(player.id, id);
  }

  @Post('remove')
  async removeByPlayer(@Req() req: Request, @Body() body: { playerId?: string }) {
    const player = await this.needPlayer(req);
    return this.friends.removeByPlayer(player.id, String(body?.playerId || ''));
  }
}
