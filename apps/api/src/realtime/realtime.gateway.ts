import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { ChatService } from '../chat/chat.service';
import { LivePvpService } from './live-pvp.service';

type AuthedSocket = Socket & { playerId?: string };

@WebSocketGateway({
  cors: {
    origin: (process.env.WEB_ORIGIN || 'http://localhost:3000').split(',').map((s) => s.trim()),
    credentials: true,
  },
  namespace: '/realtime',
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private online = new Map<string, string>(); // playerId -> socketId

  constructor(
    private readonly auth: AuthService,
    private readonly chat: ChatService,
    private readonly livePvp: LivePvpService,
  ) {}

  private async authenticate(client: AuthedSocket): Promise<string | null> {
    const token =
      (client.handshake.auth?.token as string) ||
      (client.handshake.headers?.authorization as string)?.replace(/^Bearer\s+/i, '') ||
      null;
    const player = await this.auth.playerFromToken(token);
    if (!player) return null;
    client.playerId = player.id;
    return player.id;
  }

  async handleConnection(client: AuthedSocket) {
    const playerId = await this.authenticate(client);
    if (!playerId) {
      client.disconnect(true);
      return;
    }
    this.online.set(playerId, client.id);
    client.join(`player:${playerId}`);
    this.server.emit('presence', { playerId, online: true });
  }

  handleDisconnect(client: AuthedSocket) {
    const playerId = client.playerId;
    if (!playerId) return;
    this.online.delete(playerId);
    this.livePvp.leaveQueue(playerId);
    this.server.emit('presence', { playerId, online: false });
  }

  @SubscribeMessage('chat:send')
  async onChatSend(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { receiverId?: string; body?: string },
  ) {
    const senderId = client.playerId;
    if (!senderId) return { error: 'unauthorized' };
    try {
      const result = await this.chat.send(senderId, String(body?.receiverId || ''), body?.body);
      const msg = result.message;
      this.server.to(`player:${msg.receiverId}`).emit('chat:message', msg);
      this.server.to(`player:${senderId}`).emit('chat:message', msg);
      return { ok: true, message: msg };
    } catch (e: any) {
      return { error: e?.message || 'send_failed' };
    }
  }

  @SubscribeMessage('live:queue')
  onLiveQueue(@ConnectedSocket() client: AuthedSocket) {
    const playerId = client.playerId;
    if (!playerId) return { error: 'unauthorized' };
    const result = this.livePvp.joinQueue(playerId);
    if (result.status === 'matched') {
      const payload = {
        matchId: result.matchId,
        opponentId: result.opponentId,
      };
      this.server.to(`player:${playerId}`).emit('live:matched', payload);
      this.server.to(`player:${result.opponentId}`).emit('live:matched', {
        matchId: result.matchId,
        opponentId: playerId,
      });
    }
    return result;
  }

  @SubscribeMessage('live:leave')
  onLiveLeave(@ConnectedSocket() client: AuthedSocket) {
    const playerId = client.playerId;
    if (!playerId) return { error: 'unauthorized' };
    return this.livePvp.leaveQueue(playerId);
  }

  @SubscribeMessage('live:action')
  onLiveAction(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { matchId?: string; action?: unknown },
  ) {
    const playerId = client.playerId;
    if (!playerId) return { error: 'unauthorized' };
    const match = this.livePvp.getMatch(String(body?.matchId || ''));
    if (!match || match.status !== 'active') return { error: 'no_match' };
    const opponentId = match.playerA === playerId ? match.playerB : match.playerA;
    this.server.to(`player:${opponentId}`).emit('live:action', {
      matchId: match.id,
      from: playerId,
      action: body?.action,
    });
    return { ok: true };
  }

  @SubscribeMessage('live:finish')
  onLiveFinish(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { matchId?: string; winnerId?: string },
  ) {
    const playerId = client.playerId;
    if (!playerId) return { error: 'unauthorized' };
    const match = this.livePvp.finishMatch(String(body?.matchId || ''), String(body?.winnerId || playerId));
    if (!match) return { error: 'no_match' };
    this.server.to(`player:${match.playerA}`).emit('live:finished', match);
    this.server.to(`player:${match.playerB}`).emit('live:finished', match);
    return { ok: true, match };
  }

  @SubscribeMessage('presence:ping')
  onPresencePing(@ConnectedSocket() client: AuthedSocket) {
    return { online: client.playerId ? this.online.has(client.playerId) : false };
  }
}
