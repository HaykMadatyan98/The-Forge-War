import { describe, expect, it } from 'vitest';
import { createInitialState, createWarrior } from './state';
import { seededRng, autoPlayBattle } from './simulate';
import { startBattle, beginCombatFromDeploy, makeBattleSnapshot } from './battle';
import { createBotDefenseSquad, makePvpBattleSnapshot } from './pvp';

describe('seededRng', () => {
  it('is deterministic', () => {
    const a = seededRng(42);
    const b = seededRng(42);
    expect(a()).toBe(b());
    expect(a()).toBe(b());
  });
});

describe('autoPlayBattle', () => {
  it('resolves campaign battle', () => {
    const state = createInitialState('en');
    while (state.warriors.length < 2) state.warriors.push(createWarrior({ lang: 'en' }));
    const ids = state.warriors.slice(0, 2).map((w) => w.id);
    const positions = [{ x: 1, y: 2 }, { x: 1, y: 4 }];
    const snap = makeBattleSnapshot(state, 'fields_1', 'normal', ids, positions, 'play');
    beginCombatFromDeploy(snap);
    const result = autoPlayBattle(snap, 600);
    expect(['victory', 'defeat']).toContain(result.mode);
    expect(result.steps).toBeGreaterThan(0);
  });

  it('simulates pvp ghost fight', () => {
    const state = createInitialState('en');
    while (state.warriors.length < 2) state.warriors.push(createWarrior({ lang: 'en' }));
    const bot = createBotDefenseSquad(11, 'normal', 100);
    const ids = state.warriors.slice(0, 2).map((w) => w.id);
    const positions = [{ x: 1, y: 2 }, { x: 1, y: 4 }];
    const battle = makePvpBattleSnapshot(state, bot, ids, positions, 'play');
    expect(battle).toBeTruthy();
    const result = autoPlayBattle(battle!, 600);
    expect(result.mode === 'victory' || result.mode === 'defeat').toBe(true);
  });
});

describe('startBattle', () => {
  it('creates playable battle', () => {
    const state = createInitialState('en');
    const ids = state.warriors.slice(0, 1).map((w) => w.id);
    const b = startBattle(state, 'fields_1', 'normal', ids, [{ x: 1, y: 2 }]);
    expect(b).toBeTruthy();
    expect(b!.units.length).toBeGreaterThan(1);
  });
});
