import { describe, expect, it } from 'vitest';
import { validateDeployRoster } from './deploy-validation';

const baseState = {
  barracksLevel: 1,
  warriors: [{ id: 'w1', name: 'A' }, { id: 'w2', name: 'B' }],
};

describe('validateDeployRoster', () => {
  it('accepts valid deploy', () => {
    const r = validateDeployRoster(baseState, ['w1'], [{ x: 1, y: 1 }]);
    expect(r.ok).toBe(true);
  });

  it('rejects unknown warrior', () => {
    const r = validateDeployRoster(baseState, ['ghost'], [{ x: 1, y: 1 }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid_warrior');
  });

  it('rejects out-of-zone position', () => {
    const r = validateDeployRoster(baseState, ['w1'], [{ x: 5, y: 1 }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('position_out_of_zone');
  });
});
