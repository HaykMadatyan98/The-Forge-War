import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FriendsService {
  constructor(private readonly prisma: PrismaService) {}

  private publicFriend(p: {
    id: string;
    displayName: string | null;
    avatarKey: string | null;
    email: string;
  }) {
    return {
      id: p.id,
      displayName: p.displayName,
      avatarKey: p.avatarKey,
      email: p.email,
    };
  }

  async list(playerId: string) {
    const rows = await this.prisma.friendship.findMany({
      where: {
        status: 'accepted',
        OR: [{ requesterId: playerId }, { addresseeId: playerId }],
      },
      include: {
        requester: { select: { id: true, displayName: true, avatarKey: true, email: true } },
        addressee: { select: { id: true, displayName: true, avatarKey: true, email: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return {
      friends: rows.map((r) => ({
        friendshipId: r.id,
        player: this.publicFriend(r.requesterId === playerId ? r.addressee : r.requester),
      })),
    };
  }

  async pending(playerId: string) {
    const incoming = await this.prisma.friendship.findMany({
      where: { addresseeId: playerId, status: 'pending' },
      include: {
        requester: { select: { id: true, displayName: true, avatarKey: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const outgoing = await this.prisma.friendship.findMany({
      where: { requesterId: playerId, status: 'pending' },
      include: {
        addressee: { select: { id: true, displayName: true, avatarKey: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      incoming: incoming.map((r) => ({ id: r.id, player: this.publicFriend(r.requester) })),
      outgoing: outgoing.map((r) => ({ id: r.id, player: this.publicFriend(r.addressee) })),
    };
  }

  async request(requesterId: string, addresseeId: string) {
    if (!addresseeId) throw new BadRequestException('missing_addressee');
    if (addresseeId === requesterId) throw new BadRequestException('self_friend');

    const target = await this.prisma.player.findUnique({ where: { id: addresseeId } });
    if (!target) throw new NotFoundException('player_not_found');

    const existing = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId, addresseeId },
          { requesterId: addresseeId, addresseeId: requesterId },
        ],
      },
    });
    if (existing) {
      if (existing.status === 'accepted') throw new BadRequestException('already_friends');
      if (existing.status === 'blocked') throw new ForbiddenException('blocked');
      if (existing.requesterId === requesterId) throw new BadRequestException('already_sent');
      // Reverse pending — auto-accept
      const updated = await this.prisma.friendship.update({
        where: { id: existing.id },
        data: { status: 'accepted' },
      });
      return { ok: true, friendshipId: updated.id, status: 'accepted' };
    }

    const row = await this.prisma.friendship.create({
      data: { requesterId, addresseeId, status: 'pending' },
    });
    return { ok: true, friendshipId: row.id, status: 'pending' };
  }

  async accept(playerId: string, friendshipId: string) {
    const row = await this.prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!row || row.addresseeId !== playerId) throw new NotFoundException('request_not_found');
    if (row.status !== 'pending') throw new BadRequestException('not_pending');
    await this.prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: 'accepted' },
    });
    return { ok: true };
  }

  async remove(playerId: string, friendshipId: string) {
    const row = await this.prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!row) throw new NotFoundException('not_found');
    if (row.requesterId !== playerId && row.addresseeId !== playerId) {
      throw new ForbiddenException('not_yours');
    }
    await this.prisma.friendship.delete({ where: { id: friendshipId } });
    return { ok: true };
  }

  async removeByPlayer(playerId: string, otherId: string) {
    const row = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: playerId, addresseeId: otherId },
          { requesterId: otherId, addresseeId: playerId },
        ],
      },
    });
    if (!row) throw new NotFoundException('not_found');
    await this.prisma.friendship.delete({ where: { id: row.id } });
    return { ok: true };
  }

  async areFriends(a: string, b: string) {
    if (a === b) return false;
    const row = await this.prisma.friendship.findFirst({
      where: {
        status: 'accepted',
        OR: [
          { requesterId: a, addresseeId: b },
          { requesterId: b, addresseeId: a },
        ],
      },
    });
    return !!row;
  }
}
