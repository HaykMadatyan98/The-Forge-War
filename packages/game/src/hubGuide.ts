import { BLUEPRINTS, GEAR_SLOTS } from './catalog';
import { campaignProgress, isMissionUnlocked } from './campaign';
import {
  canCraftWeapon,
  countUnarmedWarriors,
  freeWeaponCount,
  hasMats,
  itemPowerScore,
  bestItemForSlot,
  deployCap,
  listResearchable,
  rosterCap,
} from './state';
import { forgeSlotsUsed, mineSlotsUsed } from './jobs';

/** Hub destinations the player can jump to from a hint. */
export type HubGuideTab =
  | 'campaign'
  | 'mine'
  | 'forge'
  | 'research'
  | 'barracks'
  | 'tavern'
  | 'inventory'
  | 'levelup';

export type HubGuideStep = {
  id: string;
  /** Higher = more urgent */
  priority: number;
  tab: HubGuideTab;
  /** i18n key for the action line */
  labelKey: string;
  /** optional second line i18n key */
  detailKey?: string;
  /** free-form params for UI (e.g. mission name key, numbers) */
  meta?: Record<string, string | number>;
};

function canResearchAffordable(state) {
  return listResearchable(state).some((tech) => state.gold >= tech.gold && !state.research.queue);
}

function canCraftSomething(state) {
  if (forgeSlotsUsed(state) >= (state.forge?.slots || 1)) return false;
  for (const id of state.research?.unlocked || []) {
    const bp = BLUEPRINTS[id];
    if (!bp) continue;
    if (hasMats(state, bp.cost)) return true;
  }
  return false;
}

function mineHasFreeSlots(state) {
  return mineSlotsUsed(state) < (state.mine?.slots || 1);
}

function needsEquipUpgrade(state) {
  for (const w of state.warriors || []) {
    for (const slot of GEAR_SLOTS) {
      const best = bestItemForSlot(state, w, slot);
      if (!best) continue;
      const cur = w.equip?.[slot] ? state.items?.[w.equip[slot]] : null;
      if (!cur) return true;
      if (itemPowerScore(best) > itemPowerScore(cur) + 0.5) return true;
    }
  }
  return false;
}

function needsHire(state) {
  const n = state.warriors?.length || 0;
  const dep = deployCap(state);
  const cap = rosterCap(state);
  if (n >= cap) return false;
  if (n < dep) return true;
  return false;
}

/**
 * Primary loop: forge weapons → equip people → campaign fight.
 * Returns at most `limit` steps, highest priority first.
 */
export function hubNextSteps(state, limit = 3): HubGuideStep[] {
  if (!state) return [];
  const steps: HubGuideStep[] = [];
  const unarmed = countUnarmedWarriors(state);
  const freeWeapons = freeWeaponCount(state);
  const weaponsReady = canCraftWeapon(state);

  const freePts = (state.warriors || []).filter((w) => (w.freePoints || 0) > 0);
  if (freePts.length) {
    steps.push({
      id: 'levelup',
      priority: 100,
      tab: 'levelup',
      labelKey: 'guideLevelUp',
      detailKey: 'guideLevelUpDetail',
      meta: { count: freePts.length, names: freePts.map((w) => w.name).slice(0, 2).join(', ') },
    });
  }

  // Core loop when people lack weapons
  if (unarmed > 0 && freeWeapons > 0) {
    steps.push({
      id: 'equip_weapons',
      priority: 96,
      tab: 'barracks',
      labelKey: 'guideEquipWeapons',
      detailKey: 'guideEquipWeaponsDetail',
      meta: { unarmed, freeWeapons },
    });
  } else if (unarmed > 0 && weaponsReady) {
    steps.push({
      id: 'forge_weapon',
      priority: 94,
      tab: 'forge',
      labelKey: 'guideForgeWeapons',
      detailKey: 'guideForgeWeaponsDetail',
      meta: { unarmed },
    });
  } else if (unarmed > 0 && mineHasFreeSlots(state)) {
    steps.push({
      id: 'mine_for_forge',
      priority: 88,
      tab: 'mine',
      labelKey: 'guideMineForWeapons',
      detailKey: 'guideMineForWeaponsDetail',
      meta: { unarmed },
    });
  }

  if (canResearchAffordable(state) && unarmed === 0) {
    const cheap = listResearchable(state)
      .filter((t) => state.gold >= t.gold)
      .sort((a, b) => a.gold - b.gold)[0];
    steps.push({
      id: 'research',
      priority: 80,
      tab: 'research',
      labelKey: 'guideResearch',
      detailKey: 'guideResearchDetail',
      meta: { gold: cheap?.gold ?? 0, bp: cheap?.blueprintId || '' },
    });
  } else if (state.research?.queue) {
    steps.push({
      id: 'research_busy',
      priority: 25,
      tab: 'research',
      labelKey: 'guideResearchBusy',
      detailKey: 'guideResearchBusyDetail',
      meta: { bp: state.research.queue.blueprintId },
    });
  }

  if (mineHasFreeSlots(state) && unarmed === 0) {
    steps.push({
      id: 'mine',
      priority: 70,
      tab: 'mine',
      labelKey: 'guideMine',
      detailKey: 'guideMineDetail',
      meta: {
        free: (state.mine?.slots || 1) - mineSlotsUsed(state),
        slots: state.mine?.slots || 1,
      },
    });
  } else if ((state.mine?.jobs?.length || 0) > 0) {
    steps.push({
      id: 'mine_busy',
      priority: 20,
      tab: 'mine',
      labelKey: 'guideMineBusy',
      detailKey: 'guideMineBusyDetail',
    });
  }

  if (canCraftSomething(state) && unarmed === 0) {
    steps.push({
      id: 'forge',
      priority: 65,
      tab: 'forge',
      labelKey: 'guideForge',
      detailKey: 'guideForgeDetail',
    });
  }

  if (needsEquipUpgrade(state) && unarmed === 0) {
    steps.push({
      id: 'equip',
      priority: 60,
      tab: 'barracks',
      labelKey: 'guideEquip',
      detailKey: 'guideEquipDetail',
    });
  }

  const progress = campaignProgress(state);
  const clearedAny = (progress.cleared || 0) > 0;

  // After first victories: push the extract → refine → craft loop
  if (clearedAny && unarmed === 0) {
    if (mineHasFreeSlots(state)) {
      steps.push({
        id: 'loop_mine',
        priority: 72,
        tab: 'mine',
        labelKey: 'guideLoopMine',
        detailKey: 'guideLoopMineDetail',
      });
    }
    if (canCraftSomething(state)) {
      steps.push({
        id: 'loop_forge',
        priority: 68,
        tab: 'forge',
        labelKey: 'guideLoopForge',
        detailKey: 'guideLoopForgeDetail',
      });
    }
  }

  if (progress.next && isMissionUnlocked(state, progress.next.id)) {
    steps.push({
      id: 'fight',
      priority: freePts.length ? 40 : unarmed > 0 ? 35 : clearedAny ? 74 : 78,
      tab: 'campaign',
      labelKey: unarmed > 0 ? 'guideFightUnarmed' : 'guideFight',
      detailKey: unarmed > 0 ? 'guideFightUnarmedDetail' : 'guideFightDetail',
      meta: { missionId: progress.next.id, regionId: progress.next.regionId || '', unarmed },
    });
  } else if (progress.cleared >= progress.total && progress.total > 0) {
    steps.push({
      id: 'campaign_done',
      priority: 15,
      tab: 'campaign',
      labelKey: 'guideCampaignDone',
      detailKey: 'guideCampaignDoneDetail',
    });
  }

  if (needsHire(state) && state.gold >= 40 + (state.warriors?.length || 0) * 15) {
    steps.push({
      id: 'hire',
      priority: unarmed > 0 ? 28 : 45,
      tab: 'tavern',
      labelKey: 'guideHire',
      detailKey: 'guideHireDetail',
      meta: { have: state.warriors?.length || 0, need: deployCap(state) },
    });
  }

  steps.sort((a, b) => b.priority - a.priority);
  const seen = new Set<string>();
  const out: HubGuideStep[] = [];
  for (const s of steps) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}
