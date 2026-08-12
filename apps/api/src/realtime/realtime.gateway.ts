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
import { logMetric } from '../metrics/metrics';
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

  private online = new Map<string, string>();

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
      logMetric('ws_auth_fail', { socketId: client.id });
      client.disconnect(true);
      return;
    }
    this.online.set(playerId, client.id);
    client.join(`player:${playerId}`);
    logMetric('ws_connect', { playerId });
    this.server.emit('presence', { playerId, online: true });
  }

  handleDisconnect(client: AuthedSocket) {
    const playerId = client.playerId;
    if (!playerId) return;
    this.online.delete(playerId);
    this.livePvp.leaveQueue(playerId);
    logMetric('ws_disconnect', { playerId });
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
  async onLiveQueue(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body?: { mode?: 'ghost' | 'duel' },
  ) {
    const playerId = client.playerId;
    if (!playerId) return { error: 'unauthorized' };
    const mode = body?.mode === 'ghost' ? 'ghost' : 'duel';
    const result = await this.livePvp.joinQueue(playerId, mode);
    if (result.status === 'error') return { error: result.error };
    if (result.status === 'matched') {
      const forSelf = {
        matchId: result.matchId,
        opponentId: result.opponentId,
        opponent: result.opponent,
        youAre: result.youAre,
        mode: result.mode,
      };
      this.server.to(`player:${playerId}`).emit('live:matched', forSelf);

      const match = this.livePvp.getMatch(result.matchId);
      if (match) {
        const otherId = match.playerA === playerId ? match.playerB : match.playerA;
        const forOther = this.livePvp.getMatchPayloadFor(otherId, result.matchId);
        if (forOther) {
          this.server.to(`player:${otherId}`).emit('live:matched', {
            matchId: forOther.matchId,
            opponentId: forOther.opponentId,
            opponent: forOther.opponent,
            youAre: forOther.youAre,
            mode: forOther.mode,
          });
        }
      }
      return forSelf;
    }
    return result;
  }

  @SubscribeMessage('live:leave')
  onLiveLeave(@ConnectedSocket() client: AuthedSocket) {
    const playerId = client.playerId;
    if (!playerId) return { error: 'unauthorized' };
    return this.livePvp.leaveQueue(playerId);
  }

  @SubscribeMessage('live:deploy')
  onLiveDeploy(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody()
    body: { matchId?: string; warriorIds?: string[]; positions?: { x: number; y: number }[] },
  ) {
    const playerId = client.playerId;
    if (!playerId) return { error: 'unauthorized' };
    const matchId = String(body?.matchId || '');
    const res = this.livePvp.setDeploy(playerId, matchId, {
      warriorIds: body?.warriorIds || [],
      positions: body?.positions || [],
    });
    if (!res.ok) return { error: res.error };

    const match = this.livePvp.getMatch(matchId);
    if (res.started && match && 'battle' in res) {
      const payload = {
        matchId,
        battle: res.battle,
        playerA: match.playerA,
        playerB: match.playerB,
      };
      this.server.to(`player:${match.playerA}`).emit('live:battle_start', {
        ...payload,
        youAre: 'A',
      });
      this.server.to(`player:${match.playerB}`).emit('live:battle_start', {
        ...payload,
        youAre: 'B',
      });
      return { ok: true, started: true };
    }

    if (match) {
      const other = match.playerA === playerId ? match.playerB : match.playerA;
      this.server.to(`player:${other}`).emit('live:deploy_ready', {
        matchId,
        from: playerId,
      });
    }
    return { ok: true, waiting: true };
  }

  @SubscribeMessage('live:turn')
  async onLiveTurn(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { matchId?: string; action?: unknown },
  ) {
    const playerId = client.playerId;
    if (!playerId) return { error: 'unauthorized' };
    const matchId = String(body?.matchId || '');
    const res = this.livePvp.applyAction(playerId, matchId, body?.action);
    if (!res.ok) return { error: res.error };

    const match = this.livePvp.getMatch(matchId);
    if (!match) return { error: 'no_match' };

    const statePayload = {
      matchId,
      battle: res.battle,
      from: playerId,
      mode: res.mode,
    };
    this.server.to(`player:${match.playerA}`).emit('live:state', statePayload);
    this.server.to(`player:${match.playerB}`).emit('live:state', statePayload);

    if (res.finished && res.winnerId) {
      await this.livePvp.finishMatch(matchId, res.winnerId);
      const finished = {
        matchId,
        winnerId: res.winnerId,
        status: 'finished',
      };
      this.server.to(`player:${match.playerA}`).emit('live:finished', finished);
      this.server.to(`player:${match.playerB}`).emit('live:finished', finished);
    }
    return { ok: true, finished: !!res.finished, winnerId: res.winnerId };
  }

  @SubscribeMessage('live:action')
  onLiveAction(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { matchId?: string; action?: unknown },
  ) {
    // Legacy relay — prefer live:turn for authoritative duel
    const playerId = client.playerId;
    if (!playerId) return { error: 'unauthorized' };
    const match = this.livePvp.getMatch(String(body?.matchId || ''));
    if (!match || (match.status !== 'active' && match.status !== 'deploy')) return { error: 'no_match' };
    const opponentId = match.playerA === playerId ? match.playerB : match.playerA;
    this.server.to(`player:${opponentId}`).emit('live:action', {
      matchId: match.id,
      from: playerId,
      action: body?.action,
    });
    return { ok: true };
  }

  @SubscribeMessage('live:finish')
  async onLiveFinish(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { matchId?: string; victory?: boolean },
  ) {
    const playerId = client.playerId;
    if (!playerId) return { error: 'unauthorized' };
    const match = this.livePvp.getMatch(String(body?.matchId || ''));
    if (!match) return { error: 'no_match' };
    const winnerId = body?.victory ? playerId : match.playerA === playerId ? match.playerB : match.playerA;
    const finished = await this.livePvp.finishMatch(match.id, winnerId);
    if (!finished) return { error: 'no_match' };
    this.server.to(`player:${match.playerA}`).emit('live:finished', {
      matchId: finished.id,
      winnerId: finished.winnerId,
      status: finished.status,
    });
    this.server.to(`player:${match.playerB}`).emit('live:finished', {
      matchId: finished.id,
      winnerId: finished.winnerId,
      status: finished.status,
    });
    return { ok: true, match: finished };
  }

  @SubscribeMessage('presence:ping')
  onPresencePing(@ConnectedSocket() client: AuthedSocket) {
    return { online: client.playerId ? this.online.has(client.playerId) : false };
  }
}
