import { Injectable } from '@nestjs/common';
import { createRequire } from 'node:module';

const requireGame = createRequire(__filename);

@Injectable()
export class GameEngineService {
  private mod: Record<string, unknown> | null = null;

  engine(): Record<string, unknown> {
    if (!this.mod) {
      this.mod = requireGame('@tfw/game') as Record<string, unknown>;
    }
    return this.mod;
  }
}
