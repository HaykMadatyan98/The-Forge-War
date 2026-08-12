import { Injectable } from '@nestjs/common';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { logMetric } from '../metrics/metrics';
import { applyElo, RATING_DEFAULT } from '../pvp/rating';

const requireGame = createRequire(__filename);

export type LiveSquad = {
  warriors: unknown[];
  items: Record<string, unknown>;
  power: number;
  displayName: string;
  avatarKey: string | null;
};

export type DeployPayload = {
  warriorIds: string[];
  positions: { x: number; y: number }[];
};

export type LiveMatch = {
  id: string;
  playerA: string;
  playerB: string;
  createdAt: number;
  status: 'waiting' | 'deploy' | 'active' | 'finished';
  winnerId?: string;
  squadA?: LiveSquad;
  squadB?: LiveSquad;
  deployA?: DeployPayload | null;
  deployB?: DeployPayload | null;
  battle?: any;
  mode: 'ghost' | 'duel';
};

export type QueueResult =
  | { status: 'queued' }
  | {
      status: 'matched';
      matchId: string;
      opponentId: string;
      opponent: LiveSquad;
      youAre: 'A' | 'B';
      mode: 'ghost' | 'duel';
    }
  | { status: 'error'; error: string };

@Injectable()
export class LivePvpService {
  private queue: { playerId: string; mode: 'ghost' | 'duel' }[] = [];
  private matches = new Map<string, LiveMatch>();
  private playerMatch = new Map<string, string>();
  private ratedMatches = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  private game() {
    return requireGame('@tfw/game') as Record<string, any>;
  }

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

  async joinQueue(playerId: string, mode: 'ghost' | 'duel' = 'duel'): Promise<QueueResult> {
    if (this.playerMatch.has(playerId)) {
      const mid = this.playerMatch.get(playerId)!;
      const m = this.matches.get(mid);
      if (m && m.status !== 'finished') {
        const youAre = m.playerA === playerId ? 'A' : 'B';
        const opp = youAre === 'A' ? m.squadB : m.squadA;
        const opponentId = youAre === 'A' ? m.playerB : m.playerA;
        if (!opp) return { status: 'error', error: 'match_incomplete' };
        return { status: 'matched', matchId: mid, opponentId, opponent: opp, youAre, mode: m.mode };
      }
    }

    const defense = await this.loadDefense(playerId);
    if (!defense) {
      logMetric('live_pvp_queue_rejected', { reason: 'need_defense', playerId });
      return { status: 'error', error: 'need_defense' };
    }

    this.queue = this.queue.filter((q) => q.playerId !== playerId);
    this.queue.push({ playerId, mode });

    const partnerIdx = this.queue.findIndex((q) => q.playerId !== playerId && q.mode === mode);
    if (partnerIdx >= 0) {
      const partner = this.queue.splice(partnerIdx, 1)[0]!;
      this.queue = this.queue.filter((q) => q.playerId !== playerId);
      const a = partner.playerId;
      const b = playerId;
      const squadA = a === playerId ? defense : await this.loadDefense(a);
      const squadB = b === playerId ? defense : await this.loadDefense(b);
      if (!squadA || !squadB) {
        if (squadA) this.queue.push({ playerId: a, mode });
        if (squadB) this.queue.push({ playerId: b, mode });
        return { status: 'error', error: 'opponent_no_defense' };
      }

      const matchId = randomBytes(8).toString('hex');
      const match: LiveMatch = {
        id: matchId,
        playerA: a,
        playerB: b,
        createdAt: Date.now(),
        status: mode === 'duel' ? 'deploy' : 'active',
        squadA,
        squadB,
        deployA: null,
        deployB: null,
        mode,
      };
      this.matches.set(matchId, match);
      this.playerMatch.set(a, matchId);
      this.playerMatch.set(b, matchId);
      logMetric('live_pvp_matched', { matchId, playerA: a, playerB: b, mode });

      const youAre = playerId === a ? 'A' : 'B';
      return {
        status: 'matched',
        matchId,
        opponentId: youAre === 'A' ? b : a,
        opponent: youAre === 'A' ? squadB : squadA,
        youAre,
        mode,
      };
    }

    logMetric('live_pvp_queued', { playerId, queueLen: this.queue.length, mode });
    return { status: 'queued' };
  }

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
      mode: m.mode,
    };
  }

  leaveQueue(playerId: string) {
    this.queue = this.queue.filter((q) => q.playerId !== playerId);
    return { ok: true };
  }

  setDeploy(playerId: string, matchId: string, deploy: DeployPayload) {
    const m = this.matches.get(matchId);
    if (!m || m.status !== 'deploy') return { ok: false as const, error: 'no_match' };
    if (!deploy?.warriorIds?.length) return { ok: false as const, error: 'empty_deploy' };
    if (m.playerA === playerId) m.deployA = deploy;
    else if (m.playerB === playerId) m.deployB = deploy;
    else return { ok: false as const, error: 'not_in_match' };

    if (m.deployA && m.deployB && m.squadA && m.squadB) {
      const g = this.game();
      const battle = g.makeLiveDuelSnapshot(m.squadA, m.squadB, m.deployA, m.deployB, 'play');
      if (!battle) return { ok: false as const, error: 'battle_failed' };
      m.battle = battle;
      m.status = 'active';
      return {
        ok: true as const,
        started: true as const,
        battle: g.serializeBattle(battle),
      };
    }
    return { ok: true as const, started: false as const, waiting: true as const };
  }

  applyAction(playerId: string, matchId: string, action: any) {
    const m = this.matches.get(matchId);
    if (!m || m.status !== 'active' || !m.battle) return { ok: false as const, error: 'no_match' };
    const side = m.playerA === playerId ? 'A' : m.playerB === playerId ? 'B' : null;
    if (!side) return { ok: false as const, error: 'not_in_match' };
    const g = this.game();
    const res = g.applyLiveAction(m.battle, side, action);
    if (!res.ok) return { ok: false as const, error: res.err || 'rejected' };

    const finished = m.battle.mode === 'victory' || m.battle.mode === 'defeat';
    let winnerId: string | undefined;
    if (finished) {
      // victory means team player (A) won in absolute state
      if (m.battle.mode === 'victory') winnerId = m.playerA;
      else winnerId = m.playerB;
      m.status = 'finished';
      m.winnerId = winnerId;
      this.playerMatch.delete(m.playerA);
      this.playerMatch.delete(m.playerB);
    }

    return {
      ok: true as const,
      battle: g.serializeBattle(m.battle),
      finished,
      winnerId,
      mode: m.battle.mode,
    };
  }

  async finishMatch(matchId: string, winnerId: string) {
    const m = this.matches.get(matchId);
    if (!m) return null;
    if (m.status !== 'finished') {
      m.status = 'finished';
      m.winnerId = winnerId;
      this.playerMatch.delete(m.playerA);
      this.playerMatch.delete(m.playerB);
    } else if (!m.winnerId) {
      m.winnerId = winnerId;
    }
    await this.applyRating(matchId, m.playerA, m.playerB, m.winnerId || winnerId);
    logMetric('live_pvp_finished', { matchId, winnerId: m.winnerId || winnerId });
    return m;
  }

  private async applyRating(matchId: string, playerA: string, playerB: string, winnerId: string) {
    if (this.ratedMatches.has(matchId)) return;
    this.ratedMatches.add(matchId);

    const [a, b] = await Promise.all([
      this.prisma.pvpDefense.findUnique({ where: { playerId: playerA } }),
      this.prisma.pvpDefense.findUnique({ where: { playerId: playerB } }),
    ]);
    if (!a || !b) return;
    const ratingA = a.rating ?? RATING_DEFAULT;
    const ratingB = b.rating ?? RATING_DEFAULT;
    const scoreA = winnerId === playerA ? 1 : 0;
    const next = applyElo(ratingA, ratingB, scoreA);
    await this.prisma.pvpDefense.update({
      where: { playerId: playerA },
      data: {
        rating: next.a,
        ratingGames: { increment: 1 },
        ...(winnerId === playerA ? { wins: { increment: 1 } } : { losses: { increment: 1 } }),
      },
    });
    await this.prisma.pvpDefense.update({
      where: { playerId: playerB },
      data: {
        rating: next.b,
        ratingGames: { increment: 1 },
        ...(winnerId === playerB ? { wins: { increment: 1 } } : { losses: { increment: 1 } }),
      },
    });
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
