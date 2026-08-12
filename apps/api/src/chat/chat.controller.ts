import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { extractSessionToken } from '../auth/session-cookie';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly auth: AuthService,
  ) {}

  private async needPlayer(req: Request) {
    const player = await this.auth.playerFromToken(extractSessionToken(req));
    if (!player) throw new UnauthorizedException('unauthorized');
    return player;
  }

  @Post('send')
  async send(@Req() req: Request, @Body() body: { receiverId?: string; body?: string }) {
    const player = await this.needPlayer(req);
    return this.chat.send(player.id, String(body?.receiverId || ''), body?.body);
  }

  @Get('thread')
  async thread(
    @Req() req: Request,
    @Query('with') withId?: string,
    @Query('limit') limit?: string,
  ) {
    const player = await this.needPlayer(req);
    return this.chat.thread(player.id, String(withId || ''), Number(limit) || 50);
  }

  @Post('read')
  async read(@Req() req: Request, @Body() body: { withPlayerId?: string }) {
    const player = await this.needPlayer(req);
    return this.chat.markRead(player.id, String(body?.withPlayerId || ''));
  }

  @Get('unread')
  async unread(@Req() req: Request) {
    const player = await this.needPlayer(req);
    return this.chat.unreadCount(player.id);
  }
}
