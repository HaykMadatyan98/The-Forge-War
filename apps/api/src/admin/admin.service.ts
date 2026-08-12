import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async stats() {
    const [players, saves, defenses, matches, friendships, messages] = await Promise.all([
      this.prisma.player.count(),
      this.prisma.gameSave.count(),
      this.prisma.pvpDefense.count(),
      this.prisma.pvpMatch.count(),
      this.prisma.friendship.count({ where: { status: 'accepted' } }),
      this.prisma.chatMessage.count(),
    ]);
    return {
      players,
      saves,
      pvpDefenses: defenses,
      pvpMatches: matches,
      friendships,
      chatMessages: messages,
      time: Date.now(),
    };
  }

  async listPlayers(limit = 50, offset = 0) {
    const rows = await this.prisma.player.findMany({
      take: Math.min(100, Math.max(1, limit)),
      skip: Math.max(0, offset),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        emailVerified: true,
        createdAt: true,
        _count: { select: { sessions: true } },
      },
    });
    return { players: rows };
  }

  async setRole(playerId: string, role: 'user' | 'admin') {
    const player = await this.prisma.player.update({
      where: { id: playerId },
      data: { role },
      select: { id: true, email: true, role: true },
    });
    return { player };
  }
}
