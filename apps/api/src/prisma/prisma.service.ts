import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../generated/prisma/client';

function databaseUrl() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url || url.startsWith('file:')) {
    throw new Error(
      'DATABASE_URL must be a PostgreSQL connection string (e.g. postgresql://tfw:tfw@localhost:5433/tfw)',
    );
  }
  return url;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly pool: Pool;

  constructor() {
    const pool = new Pool({ connectionString: databaseUrl() });
    const adapter = new PrismaPg(pool);
    super({ adapter });
    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }
}
