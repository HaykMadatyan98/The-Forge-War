import { campaignProgress } from './campaign';
import { countUnarmedWarriors, isUnarmed } from './state';
import type { HubGuideTab } from './hubGuide';

export type QuestId =
  | 'craft_weapon'
  | 'equip_squad'
  | 'clear_fields_1'
  | 'post_defense'
  | 'upgrade_barracks'
  | 'win_pvp';

export type QuestDef = {
  id: QuestId;
  order: number;
  labelKey: string;
  detailKey: string;
  tab: HubGuideTab | 'arena';
  rewardGold: number;
  rewardSparks: number;
};

export const QUEST_CHAIN: QuestDef[] = [
  {
    id: 'craft_weapon',
    order: 1,
    labelKey: 'questCraftWeapon',
    detailKey: 'questCraftWeaponDetail',
    tab: 'forge',
    rewardGold: 25,
    rewardSparks: 1,
  },
  {
    id: 'equip_squad',
    order: 2,
    labelKey: 'questEquipSquad',
    detailKey: 'questEquipSquadDetail',
    tab: 'barracks',
    rewardGold: 20,
    rewardSparks: 1,
  },
  {
    id: 'clear_fields_1',
    order: 3,
    labelKey: 'questClearFields1',
    detailKey: 'questClearFields1Detail',
    tab: 'campaign',
    rewardGold: 40,
    rewardSparks: 2,
  },
  {
    id: 'post_defense',
    order: 4,
    labelKey: 'questPostDefense',
    detailKey: 'questPostDefenseDetail',
    tab: 'arena',
    rewardGold: 30,
    rewardSparks: 1,
  },
  {
    id: 'upgrade_barracks',
    order: 5,
    labelKey: 'questUpgradeBarracks',
    detailKey: 'questUpgradeBarracksDetail',
    tab: 'barracks',
    rewardGold: 35,
    rewardSparks: 2,
  },
  {
    id: 'win_pvp',
    order: 6,
    labelKey: 'questWinPvp',
    detailKey: 'questWinPvpDetail',
    tab: 'arena',
    rewardGold: 50,
    rewardSparks: 3,
  },
];

function questFlags(state: any) {
  if (!state.flags) state.flags = {};
  if (!state.flags.quests) state.flags.quests = { done: {}, claimed: {}, notified: {} };
  if (!state.flags.quests.done) state.flags.quests.done = {};
  if (!state.flags.quests.claimed) state.flags.quests.claimed = {};
  if (!state.flags.quests.notified) state.flags.quests.notified = {};
  return state.flags.quests as {
    done: Record<string, boolean>;
    claimed: Record<string, boolean>;
    notified: Record<string, boolean>;
  };
}

function warriorHasWeapon(state: any, w: any) {
  return !isUnarmed(w, state.items || {});
}

/** Whether quest objective is met (may still need claim). */
export function isQuestObjectiveMet(state: any, id: QuestId): boolean {
  if (!state) return false;
  switch (id) {
    case 'craft_weapon': {
      const inv = state.inventory || [];
      const hasWeaponInStash = inv.some((itemId: string) => state.items?.[itemId]?.slot === 'weapon');
      const hasEquipped = (state.warriors || []).some((w: any) => warriorHasWeapon(state, w));
      return hasWeaponInStash || hasEquipped;
    }
    case 'equip_squad':
      return countUnarmedWarriors(state) === 0 && (state.warriors?.length || 0) > 0;
    case 'clear_fields_1':
      return !!state.campaign?.cleared?.fields_1;
    case 'post_defense':
      return !!state.flags?.pvpDefensePosted;
    case 'upgrade_barracks':
      return (state.barracksLevel || 1) > 1;
    case 'win_pvp':
      return (state.flags?.pvpWins || 0) > 0;
    default:
      return false;
  }
}

export function syncQuestObjectives(state: any) {
  const qf = questFlags(state);
  for (const q of QUEST_CHAIN) {
    if (isQuestObjectiveMet(state, q.id)) qf.done[q.id] = true;
  }
}

/**
 * Mark newly completed quests and return their defs for UI toast.
 * Call before/alongside sync; persists notified flags on state.
 */
export function notifyQuestCompletions(state: any): QuestDef[] {
  const qf = questFlags(state);
  const newly: QuestDef[] = [];
  for (const q of QUEST_CHAIN) {
    const met = isQuestObjectiveMet(state, q.id);
    if (met) qf.done[q.id] = true;
    if (met && !qf.notified[q.id]) {
      qf.notified[q.id] = true;
      newly.push(q);
    }
  }
  return newly;
}

export function questList(state: any) {
  syncQuestObjectives(state);
  const qf = questFlags(state);
  void campaignProgress(state);
  return QUEST_CHAIN.map((q) => ({
    ...q,
    done: !!qf.done[q.id],
    claimed: !!qf.claimed[q.id],
    canClaim: !!qf.done[q.id] && !qf.claimed[q.id],
  })).sort((a, b) => a.order - b.order);
}

export function questsSummary(state: any) {
  const list = questList(state);
  const done = list.filter((q) => q.done).length;
  const claimed = list.filter((q) => q.claimed).length;
  const total = list.length;
  const next = list.find((q) => !q.done) || null;
  const pct = total ? done / total : 0;
  return { done, claimed, total, next, list, pct };
}

/** Claim gold+sparks for a completed quest. */
export function claimQuestReward(state: any, id: QuestId) {
  syncQuestObjectives(state);
  const def = QUEST_CHAIN.find((q) => q.id === id);
  if (!def) return { ok: false as const, err: 'unknown_quest' };
  const qf = questFlags(state);
  if (!qf.done[id]) return { ok: false as const, err: 'not_done' };
  if (qf.claimed[id]) return { ok: false as const, err: 'already_claimed' };
  qf.claimed[id] = true;
  state.gold = (state.gold || 0) + def.rewardGold;
  state.sparks = (state.sparks || 0) + (def.rewardSparks || 0);
  return { ok: true as const, gold: def.rewardGold, sparks: def.rewardSparks || 0 };
}

export function markPvpDefensePosted(state: any) {
  if (!state.flags) state.flags = {};
  state.flags.pvpDefensePosted = true;
  syncQuestObjectives(state);
}

export function markPvpWin(state: any) {
  if (!state.flags) state.flags = {};
  state.flags.pvpWins = (state.flags.pvpWins || 0) + 1;
  syncQuestObjectives(state);
}

export function activeQuestHint(state: any) {
  const { next } = questsSummary(state);
  return next;
}
