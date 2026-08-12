import { describe, expect, it } from 'vitest';
import { seededRng } from '@tfw/game';

describe('api game engine import', () => {
  it('loads @tfw/game from workspace', async () => {
    const mod = await import('@tfw/game');
    expect(typeof mod.createInitialState).toBe('function');
    expect(typeof mod.simulatePvpBattle).toBe('function');
    const rng = seededRng(1);
    expect(rng()).toBeGreaterThanOrEqual(0);
    expect(rng()).toBeLessThanOrEqual(1);
  });
});
