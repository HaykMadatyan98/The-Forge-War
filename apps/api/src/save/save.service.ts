import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { sanitizeCloudSave } from './sanitize-save';
import { logMetric } from '../metrics/metrics';

export type SaveBlob = {
  updatedAt?: number;
  [key: string]: unknown;
};

const MAX_SAVE_CHARS = 1_500_000;

@Injectable()
export class SaveService {
  constructor(private readonly prisma: PrismaService) {}

  private parse(data: string): SaveBlob {
    try {
      return JSON.parse(data) as SaveBlob;
    } catch {
      return {};
    }
  }

  async getByPlayer(playerId: string) {
    const row = await this.prisma.gameSave.findUnique({ where: { playerId } });
    return row ? this.parse(row.data) : null;
  }

  async putPlayer(playerId: string, body: SaveBlob) {
    const cleaned = sanitizeCloudSave(body) as SaveBlob;
    const json = JSON.stringify(cleaned);
    if (json.length > MAX_SAVE_CHARS) {
      throw new BadRequestException('save_too_large');
    }
    return this.upsertSave(playerId, cleaned, json);
  }

  private async upsertSave(playerId: string, body: SaveBlob, json: string) {
    const existing = await this.prisma.gameSave.findUnique({ where: { playerId } });

    if (existing) {
      const existingBlob = this.parse(existing.data);
      if (
        typeof body?.updatedAt === 'number' &&
        typeof existingBlob?.updatedAt === 'number' &&
        existingBlob.updatedAt > body.updatedAt
      ) {
        logMetric('save_conflict', { playerId });
        return {
          conflict: true as const,
          server: existingBlob,
          client: body,
        };
      }
      await this.prisma.gameSave.update({
        where: { id: existing.id },
        data: {
          data: json,
          version: existing.version + 1,
        },
      });
      return { ok: true as const, version: existing.version + 1 };
    }

    await this.prisma.gameSave.create({
      data: {
        playerId,
        data: json,
        version: 1,
      },
    });
    return { ok: true as const, version: 1 };
  }

  throwConflict(result: { conflict: true; server: SaveBlob; client: SaveBlob }) {
    throw new ConflictException(result);
  }
}
