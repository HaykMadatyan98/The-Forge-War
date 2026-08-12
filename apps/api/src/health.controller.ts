import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true, service: 'tfw-api', db: true, time: Date.now() };
    } catch {
      throw new ServiceUnavailableException({ ok: false, service: 'tfw-api', db: false });
    }
  }

  /** Liveness without DB (for boot/orchestrators if needed). */
  @Get('live')
  live() {
    return { ok: true, service: 'tfw-api', time: Date.now() };
  }
}
