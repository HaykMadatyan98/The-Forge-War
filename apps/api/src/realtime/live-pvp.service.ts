import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { logMetric } from '../metrics/metrics';

export type LiveSquad = {
  warriors: unknown[];
  items: Record<string, unknown>;
  power: number;
  displayName: string;
  avatarKey: string | null;
};

export type LiveMatch = {
  id: string;
  playerA: string;
  playerB: string;
  createdAt: number;
  status: 'waiting' | 'active' | 'finished';
  winnerId?: string;
  squadA?: LiveSquad;
  squadB?: LiveSquad;
};

export type QueueResult =
  | { status: 'queued' }
  | {
      status: 'matched';
      matchId: string;
      opponentId: string;
      opponent: LiveSquad;
      youAre: 'A' | 'B';
    }
  | { status: 'error'; error: string };

@Injectable()
export class LivePvpService {
  private queue: string[] = [];
  private matches = new Map<string, LiveMatch>();
  private playerMatch = new Map<string, string>();

  constructor(private readonly prisma: PrismaService) {}

  private parseSquad(squadJson: string, displayName: string | null, avatarKey: string | null, power: number): LiveSquad {
    try {
      const parsed = JSON.parse(squadJson) as { warriors?: unknown[]; items?: Record<string, unknown> };
      return {
        warriors: Array.isArray(parsed.warriors) ? parsed.warriors : [],
        items: parsed.items || {},
        power: power || 1,
        displayName: displayName || 'Player',
        avatarKey: avatarKey ?? null,
      };
    } catch {
      return { warriors: [], items: {}, power: 1, displayName: displayName || 'Player', avatarKey: avatarKey ?? null };
    }
  }

  async loadDefense(playerId: string): Promise<LiveSquad | null> {
    const row = await this.prisma.pvpDefense.findUnique({ where: { playerId } });
    if (!row) return null;
    const squad = this.parseSquad(row.squadJson, row.displayName, row.avatarKey, row.power);
    if (!squad.warriors.length) return null;
    return squad;
  }

  async joinQueue(playerId: string): Promise<QueueResult> {
    if (this.playerMatch.has(playerId)) {
      const mid = this.playerMatch.get(playerId)!;
      const m = this.matches.get(mid);
      if (m && m.status !== 'finished') {
        const youAre = m.playerA === playerId ? 'A' : 'B';
        const opp = youAre === 'A' ? m.squadB : m.squadA;
        const opponentId = youAre === 'A' ? m.playerB : m.playerA;
        if (!opp) return { status: 'error', error: 'match_incomplete' };
        return { status: 'matched', matchId: mid, opponentId, opponent: opp, youAre };
      }
    }

    const defense = await this.loadDefense(playerId);
    if (!defense) {
      logMetric('live_pvp_queue_rejected', { reason: 'need_defense', playerId });
      return { status: 'error', error: 'need_defense' };
    }

    const idx = this.queue.indexOf(playerId);
    if (idx >= 0) this.queue.splice(idx, 1);
    this.queue.push(playerId);

    if (this.queue.length >= 2) {
      const a = this.queue.shift()!;
      const b = this.queue.shift()!;
      const squadA = a === playerId ? defense : await this.loadDefense(a);
      const squadB = b === playerId ? defense : await this.loadDefense(b);
      if (!squadA || !squadB) {
        if (squadA) this.queue.unshift(a);
        if (squadB) this.queue.unshift(b);
        logMetric('live_pvp_queue_rejected', { reason: 'opponent_no_defense' });
        return { status: 'error', error: 'opponent_no_defense' };
      }

      const matchId = randomBytes(8).toString('hex');
      const match: LiveMatch = {
        id: matchId,
        playerA: a,
        playerB: b,
        createdAt: Date.now(),
        status: 'active',
        squadA,
        squadB,
      };
      this.matches.set(matchId, match);
      this.playerMatch.set(a, matchId);
      this.playerMatch.set(b, matchId);
      logMetric('live_pvp_matched', { matchId, playerA: a, playerB: b });

      const youAre = playerId === a ? 'A' : 'B';
      return {
        status: 'matched',
        matchId,
        opponentId: youAre === 'A' ? b : a,
        opponent: youAre === 'A' ? squadB : squadA,
        youAre,
      };
    }

    logMetric('live_pvp_queued', { playerId, queueLen: this.queue.length });
    return { status: 'queued' };
  }

  /** Payload for the other player when A triggers the match. */
  getMatchPayloadFor(playerId: string, matchId: string) {
    const m = this.matches.get(matchId);
    if (!m) return null;
    const youAre = m.playerA === playerId ? 'A' : 'B';
    const opp = youAre === 'A' ? m.squadB : m.squadA;
    const opponentId = youAre === 'A' ? m.playerB : m.playerA;
    if (!opp) return null;
    return {
      status: 'matched' as const,
      matchId,
      opponentId,
      opponent: opp,
      youAre,
    };
  }

  leaveQueue(playerId: string) {
    this.queue = this.queue.filter((id) => id !== playerId);
    const mid = this.playerMatch.get(playerId);
    if (mid) {
      const m = this.matches.get(mid);
      if (m && m.status === 'waiting') {
        this.matches.delete(mid);
        this.playerMatch.delete(m.playerA);
        this.playerMatch.delete(m.playerB);
      }
    }
    return { ok: true };
  }

  finishMatch(matchId: string, winnerId: string) {
    const m = this.matches.get(matchId);
    if (!m) return null;
    if (m.status === 'finished') return m;
    m.status = 'finished';
    m.winnerId = winnerId;
    this.playerMatch.delete(m.playerA);
    this.playerMatch.delete(m.playerB);
    logMetric('live_pvp_finished', { matchId, winnerId });
    return m;
  }

  getMatch(matchId: string) {
    return this.matches.get(matchId) || null;
  }

  getMatchForPlayer(playerId: string) {
    const mid = this.playerMatch.get(playerId);
    if (!mid) return null;
    return this.matches.get(mid) || null;
  }
}
