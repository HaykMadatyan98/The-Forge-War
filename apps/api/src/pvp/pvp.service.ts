import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { squadFromCloudSave } from './squadFromSave';
import { BattleService } from '../battle/battle.service';
import { logMetric } from '../metrics/metrics';

type PublicPlayer = {
  id: string;
  email: string;
  displayName: string | null;
  avatarKey?: string | null;
};

const MATCH_TTL_MS = 2 * 60 * 60 * 1000;
const MATCHES_PER_HOUR = 25;
const SAME_DEFENDER_COOLDOWN_MS = 3 * 60 * 1000;
const MAX_WINS_REPORTED_PER_DAY = 40;

@Injectable()
export class PvpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly battle: BattleService,
  ) {}

  /**
   * Defense board is built only from the player's cloud save — client body ignored.
   */
  async upsertDefense(player: PublicPlayer) {
    const saveRow = await this.prisma.gameSave.findUnique({ where: { playerId: player.id } });
    if (!saveRow) throw new BadRequestException('no_cloud_save');
    let save: unknown;
    try {
      save = JSON.parse(saveRow.data);
    } catch {
      throw new BadRequestException('corrupt_save');
    }
    const squad = squadFromCloudSave(save);
    if (!squad) throw new BadRequestException('empty_squad');

    const squadJson = JSON.stringify({ warriors: squad.warriors, items: squad.items });
    const row = await this.prisma.pvpDefense.upsert({
      where: { playerId: player.id },
      create: {
        playerId: player.id,
        displayName: player.displayName,
        avatarKey: player.avatarKey ?? null,
        power: squad.power,
        squadJson,
      },
      update: {
        displayName: player.displayName,
        avatarKey: player.avatarKey ?? null,
        power: squad.power,
        squadJson,
      },
    });

    return {
      ok: true,
      power: row.power,
      wins: row.wins,
      losses: row.losses,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private parseSquad(squadJson: string) {
    try {
      return JSON.parse(squadJson) as { warriors?: unknown[]; items?: Record<string, unknown> };
    } catch {
      return { warriors: [], items: {} };
    }
  }

  async listOpponents(selfId: string, limit = 8, myPower?: number) {
    const rows = await this.prisma.pvpDefense.findMany({
      where: { playerId: { not: selfId } },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(60, Math.max(limit * 4, 24)),
    });

    const mine = Math.max(0, Number(myPower) || 0);
    const scored = rows
      .map((r) => ({
        row: r,
        delta: mine > 0 ? Math.abs(r.power - mine) : 0,
      }))
      .sort((a, b) => {
        if (mine > 0 && a.delta !== b.delta) return a.delta - b.delta;
        return b.row.updatedAt.getTime() - a.row.updatedAt.getTime();
      });

    const close = scored.slice(0, Math.max(limit, Math.ceil(limit * 0.75)));
    const rest = scored.slice(close.length);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    const picked = [...close, ...rest.slice(0, Math.max(0, limit - close.length))].slice(0, limit);

    return {
      opponents: picked.map(({ row: r }) => {
        const squad = this.parseSquad(r.squadJson);
        const warriors = Array.isArray(squad.warriors) ? squad.warriors : [];
        const rosterPreview = warriors.slice(0, 4).map((w: any) => ({
          name: String(w?.name || '?').slice(0, 18),
          level: Math.max(1, Number(w?.level) || 1),
        }));
        return {
          playerId: r.playerId,
          displayName: r.displayName || 'Player',
          avatarKey: r.avatarKey,
          power: r.power,
          wins: r.wins,
          losses: r.losses,
          warriorCount: warriors.length,
          rosterPreview,
          squad: {
            warriors,
            items: squad.items || {},
            power: r.power,
          },
        };
      }),
    };
  }

  async myDefense(playerId: string) {
    const row = await this.prisma.pvpDefense.findUnique({ where: { playerId } });
    if (!row) return { defense: null };
    return {
      defense: {
        power: row.power,
        wins: row.wins,
        losses: row.losses,
        updatedAt: row.updatedAt.toISOString(),
        displayName: row.displayName,
        avatarKey: row.avatarKey,
      },
    };
  }

  async openChallenge(attackerId: string, defenderId: string) {
    if (!defenderId || defenderId.startsWith('bot_')) {
      throw new BadRequestException('human_opponent_required');
    }
    if (defenderId === attackerId) throw new BadRequestException('self_fight');

    const defense = await this.prisma.pvpDefense.findUnique({ where: { playerId: defenderId } });
    if (!defense) throw new NotFoundException('opponent_not_found');

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await this.prisma.pvpMatch.count({
      where: { attackerId, createdAt: { gte: hourAgo } },
    });
    if (recent >= MATCHES_PER_HOUR) throw new ForbiddenException('match_rate_limited');

    const cooldownSince = new Date(Date.now() - SAME_DEFENDER_COOLDOWN_MS);
    const recentSame = await this.prisma.pvpMatch.findFirst({
      where: {
        attackerId,
        defenderId,
        createdAt: { gte: cooldownSince },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (recentSame) throw new ForbiddenException('defender_cooldown');

    // Expire stale open matches for this attacker
    await this.prisma.pvpMatch.updateMany({
      where: {
        attackerId,
        status: 'open',
        expiresAt: { lt: new Date() },
      },
      data: { status: 'expired' },
    });

    const openCount = await this.prisma.pvpMatch.count({
      where: { attackerId, status: 'open', expiresAt: { gt: new Date() } },
    });
    if (openCount >= 3) throw new ForbiddenException('too_many_open_matches');

    const expiresAt = new Date(Date.now() + MATCH_TTL_MS);
    const match = await this.prisma.pvpMatch.create({
      data: {
        attackerId,
        defenderId,
        status: 'open',
        expiresAt,
      },
    });

    const squad = this.parseSquad(defense.squadJson);
    const warriors = Array.isArray(squad.warriors) ? squad.warriors : [];
    return {
      matchId: match.id,
      expiresAt: expiresAt.toISOString(),
      opponent: {
        playerId: defenderId,
        displayName: defense.displayName || 'Player',
        avatarKey: defense.avatarKey,
        power: defense.power,
        warriorCount: warriors.length,
        squad: {
          warriors,
          items: squad.items || {},
          power: defense.power,
        },
      },
    };
  }

  async recordResult(
    attackerId: string,
    matchId: string,
    victory: boolean,
    deploy?: { warriorIds?: string[]; positions?: { x: number; y: number }[] },
  ) {
    if (!matchId) throw new BadRequestException('missing_match');

    const match = await this.prisma.pvpMatch.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundException('match_not_found');
    if (match.attackerId !== attackerId) throw new ForbiddenException('not_your_match');
    if (match.status === 'resolved') throw new BadRequestException('already_resolved');
    if (match.status === 'expired' || match.expiresAt.getTime() < Date.now()) {
      if (match.status === 'open') {
        await this.prisma.pvpMatch.update({
          where: { id: match.id },
          data: { status: 'expired' },
        });
      }
      throw new BadRequestException('match_expired');
    }
    if (match.status !== 'open') throw new BadRequestException('invalid_match_status');

    let acceptedVictory = !!victory;
    if (process.env.VALIDATE_PVP !== '0') {
      const saveRow = await this.prisma.gameSave.findUnique({ where: { playerId: attackerId } });
      const defense = await this.prisma.pvpDefense.findUnique({ where: { playerId: match.defenderId } });

      if (victory && !deploy?.warriorIds?.length) {
        throw new ForbiddenException('deploy_required');
      }

      if (saveRow && defense && deploy?.warriorIds?.length) {
        try {
          const state = JSON.parse(saveRow.data) as Record<string, unknown>;
          const squad = this.parseSquad(defense.squadJson);
          const check = await this.battle.validatePvpResult(
            state,
            { warriors: squad.warriors || [], items: squad.items || {}, power: defense.power },
            deploy.warriorIds,
            deploy.positions || [],
            matchId,
            true,
          );
          if (!check.accepted) {
            logMetric('pvp_result_rejected', {
              matchId,
              attackerId,
              reason: (check as any).reason || 'rejected',
            });
            throw new ForbiddenException('result_rejected');
          }
          if (!check.simulatedVictory && !check.softPass) {
            acceptedVictory = false;
          }
        } catch (e) {
          if (e instanceof ForbiddenException) throw e;
          if (victory) throw new ForbiddenException('validation_failed');
        }
      } else if (victory) {
        throw new ForbiddenException('validation_unavailable');
      }
    }

    if (acceptedVictory) {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const winsToday = await this.prisma.pvpMatch.count({
        where: {
          attackerId,
          status: 'resolved',
          victory: true,
          resolvedAt: { gte: dayAgo },
        },
      });
      if (winsToday >= MAX_WINS_REPORTED_PER_DAY) {
        throw new ForbiddenException('daily_win_cap');
      }
    }

    await this.prisma.pvpMatch.update({
      where: { id: match.id },
      data: {
        status: 'resolved',
        victory: acceptedVictory,
        resolvedAt: new Date(),
      },
    });

    const opp = await this.prisma.pvpDefense.findUnique({ where: { playerId: match.defenderId } });
    if (opp) {
      await this.prisma.pvpDefense.update({
        where: { playerId: match.defenderId },
        data: acceptedVictory ? { losses: { increment: 1 } } : { wins: { increment: 1 } },
      });
    }

    await this.prisma.pvpDefense
      .updateMany({
        where: { playerId: attackerId },
        data: acceptedVictory ? { wins: { increment: 1 } } : { losses: { increment: 1 } },
      })
      .catch(() => {});

    return { ok: true, matchId: match.id, victory: acceptedVictory };
  }
}
