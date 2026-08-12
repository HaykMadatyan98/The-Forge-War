import { describe, expect, it } from 'vitest';
import { createInitialState } from './state';
import { claimQuestReward, isQuestObjectiveMet, questList, syncQuestObjectives } from './quests';

describe('quests', () => {
  it('tracks craft weapon when stash has weapon', () => {
    const s = createInitialState('en');
    s.items.weapon1 = {
      id: 'weapon1',
      blueprintId: 'bp_copper_sword',
      slot: 'weapon',
      rarity: 'c',
      stats: { atk: 2 },
    };
    s.inventory.push('weapon1');
    syncQuestObjectives(s);
    expect(isQuestObjectiveMet(s, 'craft_weapon')).toBe(true);
  });

  it('claims reward once', () => {
    const s = createInitialState('en');
    s.items.weapon1 = {
      id: 'weapon1',
      blueprintId: 'bp_copper_sword',
      slot: 'weapon',
      rarity: 'c',
      stats: { atk: 2 },
    };
    s.inventory.push('weapon1');
    syncQuestObjectives(s);
    const goldBefore = s.gold;
    const sparksBefore = s.sparks;
    const first = claimQuestReward(s, 'craft_weapon');
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(s.gold).toBe(goldBefore + first.gold);
      expect(s.sparks).toBe(sparksBefore + first.sparks);
    }
    const second = claimQuestReward(s, 'craft_weapon');
    expect(second.ok).toBe(false);
    expect(questList(s)[0].claimed).toBe(true);
  });
});
