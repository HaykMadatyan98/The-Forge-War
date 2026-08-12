import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { logMetric } from '../metrics/metrics';
import { applyElo, RATING_DEFAULT } from '../pvp/rating';

const requireGame = createRequire(__filename);

export const LIVE_TURN_MS = 55_000;
export const RECONNECT_GRACE_MS = 60_000;
export const RATING_MATCH_WINDOW = 200;
export const RATING_MATCH_EXPANDED = 400;

export type LiveSquad = {
  warriors: unknown[];
  items: Record<string, unknown>;
  power: number;
  displayName: string;
  avatarKey: string | null;
  rating?: number;
};

export type DeployPayload = {
  warriorIds: string[];
  positions: { x: number; y: number }[];
};

export type LiveRatingResult = {
  beforeA: number;
  beforeB: number;
  afterA: number;
  afterB: number;
  deltaA: number;
  deltaB: number;
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
  turnDeadline?: number;
  turnSide?: 'A' | 'B';
  disconnectedAt?: Record<string, number>;
  ratingResult?: LiveRatingResult;
  actionLog?: string[];
};

type QueueEntry = {
  playerId: string;
  mode: 'ghost' | 'duel';
  rating: number;
  queuedAt: number;
};

export type QueueResult =
  | { status: 'queued'; rating?: number }
  | {
      status: 'matched';
      matchId: string;
      opponentId: string;
      opponent: LiveSquad;
      youAre: 'A' | 'B';
      mode: 'ghost' | 'duel';
    }
  | { status: 'error'; error: string };

export type RejoinPayload = {
  matchId: string;
  youAre: 'A' | 'B';
  status: LiveMatch['status'];
  opponent: LiveSquad;
  opponentId: string;
  battle?: any;
  turnDeadline?: number;
  turnSide?: 'A' | 'B';
  deployReady: { self: boolean; opponent: boolean };
  mode: 'ghost' | 'duel';
};

type BroadcastFn = (event: string, playerIds: string[], payload: unknown) => void;

@Injectable()
export class LivePvpService implements OnModuleDestroy {
  private queue: QueueEntry[] = [];
  private matches = new Map<string, LiveMatch>();
  private playerMatch = new Map<string, string>();
  private ratedMatches = new Set<string>();
  private turnTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private broadcast: BroadcastFn | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleDestroy() {
    for (const t of this.turnTimers.values()) clearTimeout(t);
    this.turnTimers.clear();
  }

  setBroadcast(fn: BroadcastFn) {
    this.broadcast = fn;
  }

  private game() {
    return requireGame('@tfw/game') as Record<string, any>;
  }

  private emitToMatch(m: LiveMatch, event: string, payload: unknown) {
    this.broadcast?.(event, [m.playerA, m.playerB], payload);
  }

  private parseSquad(
    squadJson: string,
    displayName: string | null,
    avatarKey: string | null,
    power: number,
    rating?: number,
  ): LiveSquad {
    try {
      const parsed = JSON.parse(squadJson) as { warriors?: unknown[]; items?: Record<string, unknown> };
      return {
        warriors: Array.isArray(parsed.warriors) ? parsed.warriors : [],
        items: parsed.items || {},
        power: power || 1,
        displayName: displayName || 'Player',
        avatarKey: avatarKey ?? null,
        rating: rating ?? RATING_DEFAULT,
      };
    } catch {
      return {
        warriors: [],
        items: {},
        power: 1,
        displayName: displayName || 'Player',
        avatarKey: avatarKey ?? null,
        rating: rating ?? RATING_DEFAULT,
      };
    }
  }

  private async loadDefenseRow(playerId: string) {
    return this.prisma.pvpDefense.findUnique({ where: { playerId } });
  }

  async loadDefense(playerId: string): Promise<LiveSquad | null> {
    const row = await this.loadDefenseRow(playerId);
    if (!row) return null;
    const squad = this.parseSquad(row.squadJson, row.displayName, row.avatarKey, row.power, row.rating ?? RATING_DEFAULT);
    if (!squad.warriors.length) return null;
    return squad;
  }

  private logAction(m: LiveMatch, line: string) {
    if (!m.actionLog) m.actionLog = [];
    m.actionLog.unshift(`${new Date().toISOString()} ${line}`);
    if (m.actionLog.length > 30) m.actionLog.length = 30;
  }

  private clearTurnTimer(matchId: string) {
    const t = this.turnTimers.get(matchId);
    if (t) clearTimeout(t);
    this.turnTimers.delete(matchId);
  }

  private syncTurnDeadline(m: LiveMatch) {
    if (m.status !== 'active' || !m.battle) {
      m.turnDeadline = undefined;
      m.turnSide = undefined;
      return;
    }
    const g = this.game();
    const side = g.activeSide?.(m.battle) as 'A' | 'B' | null;
    if (!side) {
      m.turnDeadline = undefined;
      m.turnSide = undefined;
      return;
    }
    m.turnSide = side;
    m.turnDeadline = Date.now() + LIVE_TURN_MS;
  }

  private scheduleTurnTimer(matchId: string) {
    this.clearTurnTimer(matchId);
    const m = this.matches.get(matchId);
    if (!m || m.status !== 'active' || !m.battle) return;
    this.syncTurnDeadline(m);
    const deadline = m.turnDeadline;
    if (!deadline) return;
    const delay = Math.max(500, deadline - Date.now());
    const t = setTimeout(() => void this.onTurnTimeout(matchId), delay);
    this.turnTimers.set(matchId, t);
  }

  private async onTurnTimeout(matchId: string) {
    const m = this.matches.get(matchId);
    if (!m || m.status !== 'active' || !m.battle) return;
    const g = this.game();
    const side = g.activeSide?.(m.battle) as 'A' | 'B' | null;
    if (!side) return;
    const playerId = side === 'A' ? m.playerA : m.playerB;
    this.logAction(m, `turn_timeout side=${side} player=${playerId.slice(0, 8)}`);
    const res = this.applyActionInternal(m, playerId, { type: 'endTurn' }, true);
    if (!res.ok) return;
    this.emitState(m, 'timeout');
    if (res.finished && res.winnerId) {
      await this.finishMatch(matchId, res.winnerId);
      this.emitFinished(m);
    }
  }

  private emitState(m: LiveMatch, from?: string) {
    const g = this.game();
    const payload = {
      matchId: m.id,
      battle: m.battle ? g.serializeBattle(m.battle) : null,
      from,
      mode: m.battle?.mode,
      turnDeadline: m.turnDeadline,
      turnSide: m.turnSide,
      status: m.status,
    };
    this.emitToMatch(m, 'live:state', payload);
  }

  private buildFinishedFor(playerId: string, m: LiveMatch) {
    const youAre = m.playerA === playerId ? 'A' : 'B';
    const r = m.ratingResult;
    let rating: { before: number; after: number; delta: number } | null = null;
    if (r) {
      if (youAre === 'A') rating = { before: r.beforeA, after: r.afterA, delta: r.deltaA };
      else rating = { before: r.beforeB, after: r.afterB, delta: r.deltaB };
    }
    return {
      matchId: m.id,
      winnerId: m.winnerId,
      status: m.status,
      youWon: m.winnerId === playerId,
      rating,
    };
  }

  private emitFinished(m: LiveMatch) {
    this.broadcast?.('live:finished', [m.playerA], this.buildFinishedFor(m.playerA, m));
    this.broadcast?.('live:finished', [m.playerB], this.buildFinishedFor(m.playerB, m));
  }

  private pickQueuePartner(self: QueueEntry): QueueEntry | null {
    const waitMs = Date.now() - self.queuedAt;
    let window = RATING_MATCH_WINDOW;
    if (waitMs > 30_000) window = RATING_MATCH_EXPANDED;
    if (waitMs > 60_000) window = Number.POSITIVE_INFINITY;

    const candidates = this.queue.filter((q) => q.playerId !== self.playerId && q.mode === self.mode);
    let best: QueueEntry | null = null;
    let bestDiff = Infinity;
    for (const c of candidates) {
      const diff = Math.abs(c.rating - self.rating);
      if (diff <= window && diff < bestDiff) {
        bestDiff = diff;
        best = c;
      }
    }
    return best;
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

    const row = await this.loadDefenseRow(playerId);
    const defense = row ? this.parseSquad(row.squadJson, row.displayName, row.avatarKey, row.power, row.rating ?? RATING_DEFAULT) : null;
    if (!defense) {
      logMetric('live_pvp_queue_rejected', { reason: 'need_defense', playerId });
      return { status: 'error', error: 'need_defense' };
    }

    this.queue = this.queue.filter((q) => q.playerId !== playerId);
    const entry: QueueEntry = {
      playerId,
      mode,
      rating: row?.rating ?? RATING_DEFAULT,
      queuedAt: Date.now(),
    };
    this.queue.push(entry);

    const partner = this.pickQueuePartner(entry);
    if (partner) {
      this.queue = this.queue.filter((q) => q.playerId !== playerId && q.playerId !== partner.playerId);
      const a = partner.playerId;
      const b = playerId;
      const squadA = a === playerId ? defense : await this.loadDefense(a);
      const squadB = b === playerId ? defense : await this.loadDefense(b);
      if (!squadA || !squadB) {
        if (squadA) this.queue.push({ playerId: a, mode, rating: squadA.rating ?? RATING_DEFAULT, queuedAt: Date.now() });
        if (squadB) this.queue.push({ playerId: b, mode, rating: squadB.rating ?? RATING_DEFAULT, queuedAt: Date.now() });
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
        disconnectedAt: {},
        actionLog: [],
      };
      this.matches.set(matchId, match);
      this.playerMatch.set(a, matchId);
      this.playerMatch.set(b, matchId);
      logMetric('live_pvp_matched', {
        matchId,
        playerA: a,
        playerB: b,
        mode,
        ratingDiff: Math.abs((squadA.rating ?? 1000) - (squadB.rating ?? 1000)),
      });

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

    logMetric('live_pvp_queued', { playerId, queueLen: this.queue.length, mode, rating: entry.rating });
    return { status: 'queued', rating: entry.rating };
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

  getRejoinPayload(playerId: string): RejoinPayload | null {
    const mid = this.playerMatch.get(playerId);
    if (!mid) return null;
    const m = this.matches.get(mid);
    if (!m || m.status === 'finished') return null;

    const disc = m.disconnectedAt?.[playerId];
    if (disc && Date.now() - disc > RECONNECT_GRACE_MS) {
      return null;
    }

    const youAre = m.playerA === playerId ? 'A' : 'B';
    const opp = youAre === 'A' ? m.squadB : m.squadA;
    const opponentId = youAre === 'A' ? m.playerB : m.playerA;
    if (!opp) return null;

    const g = this.game();
    return {
      matchId: m.id,
      youAre,
      status: m.status,
      opponent: opp,
      opponentId,
      battle: m.battle ? g.serializeBattle(m.battle) : undefined,
      turnDeadline: m.turnDeadline,
      turnSide: m.turnSide,
      deployReady: {
        self: youAre === 'A' ? !!m.deployA : !!m.deployB,
        opponent: youAre === 'A' ? !!m.deployB : !!m.deployA,
      },
      mode: m.mode,
    };
  }

  markDisconnected(playerId: string) {
    const mid = this.playerMatch.get(playerId);
    if (!mid) return;
    const m = this.matches.get(mid);
    if (!m || m.status === 'finished') return;
    if (!m.disconnectedAt) m.disconnectedAt = {};
    m.disconnectedAt[playerId] = Date.now();
    this.logAction(m, `disconnect ${playerId.slice(0, 8)}`);
    const other = m.playerA === playerId ? m.playerB : m.playerA;
    this.broadcast?.('live:opponent_disconnect', [other], {
      matchId: m.id,
      playerId,
      graceMs: RECONNECT_GRACE_MS,
    });
    logMetric('live_pvp_disconnect', { matchId: m.id, playerId });
  }

  markReconnected(playerId: string) {
    const mid = this.playerMatch.get(playerId);
    if (!mid) return;
    const m = this.matches.get(mid);
    if (!m) return;
    if (m.disconnectedAt) delete m.disconnectedAt[playerId];
    this.logAction(m, `reconnect ${playerId.slice(0, 8)}`);
    const other = m.playerA === playerId ? m.playerB : m.playerA;
    this.broadcast?.('live:opponent_reconnect', [other], { matchId: m.id, playerId });
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

    this.logAction(m, `deploy ${playerId.slice(0, 8)} units=${deploy.warriorIds.length}`);

    if (m.deployA && m.deployB && m.squadA && m.squadB) {
      const g = this.game();
      const battle = g.makeLiveDuelSnapshot(m.squadA, m.squadB, m.deployA, m.deployB, 'play');
      if (!battle) return { ok: false as const, error: 'battle_failed' };
      m.battle = battle;
      m.status = 'active';
      this.scheduleTurnTimer(matchId);
      return {
        ok: true as const,
        started: true as const,
        battle: g.serializeBattle(battle),
        turnDeadline: m.turnDeadline,
        turnSide: m.turnSide,
      };
    }
    return { ok: true as const, started: false as const, waiting: true as const };
  }

  private applyActionInternal(m: LiveMatch, playerId: string, action: any, fromTimeout = false) {
    if (m.status !== 'active' || !m.battle) return { ok: false as const, error: 'no_match' };
    const side = m.playerA === playerId ? 'A' : m.playerB === playerId ? 'B' : null;
    if (!side) return { ok: false as const, error: 'not_in_match' };

    const disc = m.disconnectedAt?.[playerId];
    if (disc && !fromTimeout) {
      return { ok: false as const, error: 'reconnecting' };
    }

    const g = this.game();
    const res = g.applyLiveAction(m.battle, side, action);
    if (!res.ok) {
      this.logAction(m, `reject ${playerId.slice(0, 8)} ${action?.type} ${res.err}`);
      logMetric('live_pvp_action_rejected', { matchId: m.id, err: res.err, playerId });
      return { ok: false as const, error: res.err || 'rejected' };
    }

    this.logAction(m, `action ${playerId.slice(0, 8)} ${action?.type}${fromTimeout ? ' (timeout)' : ''}`);

    const finished = m.battle.mode === 'victory' || m.battle.mode === 'defeat';
    let winnerId: string | undefined;
    if (finished) {
      winnerId = m.battle.mode === 'victory' ? m.playerA : m.playerB;
      m.status = 'finished';
      m.winnerId = winnerId;
      this.clearTurnTimer(m.id);
      this.playerMatch.delete(m.playerA);
      this.playerMatch.delete(m.playerB);
    } else {
      this.scheduleTurnTimer(m.id);
    }

    return {
      ok: true as const,
      battle: g.serializeBattle(m.battle),
      finished,
      winnerId,
      mode: m.battle.mode,
      turnDeadline: m.turnDeadline,
      turnSide: m.turnSide,
    };
  }

  applyAction(playerId: string, matchId: string, action: any) {
    const m = this.matches.get(matchId);
    if (!m) return { ok: false as const, error: 'no_match' };
    return this.applyActionInternal(m, playerId, action, false);
  }

  async finishMatch(matchId: string, winnerId: string) {
    const m = this.matches.get(matchId);
    if (!m) return null;
    this.clearTurnTimer(matchId);
    if (m.status !== 'finished') {
      m.status = 'finished';
      m.winnerId = winnerId;
      this.playerMatch.delete(m.playerA);
      this.playerMatch.delete(m.playerB);
    } else if (!m.winnerId) {
      m.winnerId = winnerId;
    }
    m.ratingResult = (await this.applyRating(matchId, m.playerA, m.playerB, m.winnerId || winnerId)) ?? undefined;
    logMetric('live_pvp_finished', { matchId, winnerId: m.winnerId || winnerId });
    return m;
  }

  private async applyRating(
    matchId: string,
    playerA: string,
    playerB: string,
    winnerId: string,
  ): Promise<LiveRatingResult | null> {
    if (this.ratedMatches.has(matchId)) {
      const m = this.matches.get(matchId);
      return m?.ratingResult ?? null;
    }
    this.ratedMatches.add(matchId);

    const [a, b] = await Promise.all([
      this.prisma.pvpDefense.findUnique({ where: { playerId: playerA } }),
      this.prisma.pvpDefense.findUnique({ where: { playerId: playerB } }),
    ]);
    if (!a || !b) return null;

    const beforeA = a.rating ?? RATING_DEFAULT;
    const beforeB = b.rating ?? RATING_DEFAULT;
    const scoreA = winnerId === playerA ? 1 : 0;
    const next = applyElo(beforeA, beforeB, scoreA);

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

    return {
      beforeA,
      beforeB,
      afterA: next.a,
      afterB: next.b,
      deltaA: next.deltaA,
      deltaB: next.deltaB,
    };
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
