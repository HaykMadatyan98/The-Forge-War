import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FriendsService } from '../friends/friends.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly friends: FriendsService,
  ) {}

  private normalizeBody(raw: unknown) {
    const s = String(raw || '')
      .trim()
      .slice(0, 2000);
    if (s.length < 1) throw new BadRequestException('empty_message');
    return s;
  }

  async send(senderId: string, receiverId: string, body: unknown) {
    if (!receiverId) throw new BadRequestException('missing_receiver');
    if (receiverId === senderId) throw new BadRequestException('self_message');
    const text = this.normalizeBody(body);

    const receiver = await this.prisma.player.findUnique({ where: { id: receiverId } });
    if (!receiver) throw new NotFoundException('receiver_not_found');

    const friends = await this.friends.areFriends(senderId, receiverId);
    if (!friends) throw new ForbiddenException('not_friends');

    const msg = await this.prisma.chatMessage.create({
      data: { senderId, receiverId, body: text },
      include: {
        sender: { select: { id: true, displayName: true, avatarKey: true } },
      },
    });
    return {
      message: {
        id: msg.id,
        body: msg.body,
        senderId: msg.senderId,
        receiverId: msg.receiverId,
        createdAt: msg.createdAt.toISOString(),
        sender: msg.sender,
      },
    };
  }

  async thread(playerId: string, withId: string, limit = 50) {
    if (!withId) throw new BadRequestException('missing_peer');
    const n = Math.min(100, Math.max(1, limit));
    const rows = await this.prisma.chatMessage.findMany({
      where: {
        OR: [
          { senderId: playerId, receiverId: withId },
          { senderId: withId, receiverId: playerId },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: n,
      include: {
        sender: { select: { id: true, displayName: true, avatarKey: true } },
      },
    });
    return {
      messages: rows.reverse().map((m) => ({
        id: m.id,
        body: m.body,
        senderId: m.senderId,
        receiverId: m.receiverId,
        readAt: m.readAt?.toISOString() || null,
        createdAt: m.createdAt.toISOString(),
        sender: m.sender,
      })),
    };
  }

  async markRead(playerId: string, withId: string) {
    await this.prisma.chatMessage.updateMany({
      where: { senderId: withId, receiverId: playerId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async unreadCount(playerId: string) {
    const count = await this.prisma.chatMessage.count({
      where: { receiverId: playerId, readAt: null },
    });
    return { count };
  }
}
