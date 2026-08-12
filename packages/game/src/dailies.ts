import { dayKey } from './energy';
import type { HubGuideTab } from './hubGuide';

export type DailyQuestId =
  | 'daily_mine'
  | 'daily_craft'
  | 'daily_smelt'
  | 'daily_campaign'
  | 'daily_pvp'
  | 'daily_live'
  | 'daily_research';

export type DailyQuestDef = {
  id: DailyQuestId;
  labelKey: string;
  detailKey: string;
  tab: HubGuideTab | 'arena';
  target: number;
  rewardGold: number;
  rewardSparks: number;
};

export const DAILY_QUESTS: DailyQuestDef[] = [
  {
    id: 'daily_mine',
    labelKey: 'dailyMine',
    detailKey: 'dailyMineDetail',
    tab: 'mine',
    target: 3,
    rewardGold: 25,
    rewardSparks: 1,
  },
  {
    id: 'daily_craft',
    labelKey: 'dailyCraft',
    detailKey: 'dailyCraftDetail',
    tab: 'forge',
    target: 2,
    rewardGold: 30,
    rewardSparks: 1,
  },
  {
    id: 'daily_smelt',
    labelKey: 'dailySmelt',
    detailKey: 'dailySmeltDetail',
    tab: 'mine',
    target: 2,
    rewardGold: 20,
    rewardSparks: 1,
  },
  {
    id: 'daily_campaign',
    labelKey: 'dailyCampaign',
    detailKey: 'dailyCampaignDetail',
    tab: 'campaign',
    target: 1,
    rewardGold: 35,
    rewardSparks: 1,
  },
  {
    id: 'daily_pvp',
    labelKey: 'dailyPvp',
    detailKey: 'dailyPvpDetail',
    tab: 'arena',
    target: 2,
    rewardGold: 40,
    rewardSparks: 2,
  },
  {
    id: 'daily_live',
    labelKey: 'dailyLive',
    detailKey: 'dailyLiveDetail',
    tab: 'arena',
    target: 1,
    rewardGold: 45,
    rewardSparks: 2,
  },
  {
    id: 'daily_research',
    labelKey: 'dailyResearch',
    detailKey: 'dailyResearchDetail',
    tab: 'research',
    target: 1,
    rewardGold: 25,
    rewardSparks: 1,
  },
];

function dailyBag(state: any) {
  if (!state.flags) state.flags = {};
  const today = dayKey();
  if (!state.flags.dailies || state.flags.dailies.day !== today) {
    state.flags.dailies = {
      day: today,
      progress: {},
      claimed: {},
      notified: {},
    };
  }
  if (!state.flags.dailies.progress) state.flags.dailies.progress = {};
  if (!state.flags.dailies.claimed) state.flags.dailies.claimed = {};
  if (!state.flags.dailies.notified) state.flags.dailies.notified = {};
  return state.flags.dailies as {
    day: string;
    progress: Record<string, number>;
    claimed: Record<string, boolean>;
    notified: Record<string, boolean>;
  };
}

export function bumpDaily(state: any, id: DailyQuestId, amount = 1) {
  const d = dailyBag(state);
  const def = DAILY_QUESTS.find((q) => q.id === id);
  if (!def) return;
  d.progress[id] = Math.min(def.target, (d.progress[id] || 0) + amount);
}

export function dailyList(state: any) {
  const d = dailyBag(state);
  return DAILY_QUESTS.map((q) => {
    const progress = Math.min(q.target, d.progress[q.id] || 0);
    const done = progress >= q.target;
    const claimed = !!d.claimed[q.id];
    return {
      ...q,
      progress,
      done,
      claimed,
      canClaim: done && !claimed,
    };
  });
}

export function dailiesSummary(state: any) {
  const list = dailyList(state);
  const done = list.filter((q) => q.done).length;
  const claimed = list.filter((q) => q.claimed).length;
  return { done, claimed, total: list.length, list, day: dailyBag(state).day };
}

export function claimDailyReward(state: any, id: DailyQuestId) {
  const def = DAILY_QUESTS.find((q) => q.id === id);
  if (!def) return { ok: false as const, err: 'unknown' };
  const d = dailyBag(state);
  const progress = d.progress[id] || 0;
  if (progress < def.target) return { ok: false as const, err: 'not_done' };
  if (d.claimed[id]) return { ok: false as const, err: 'already_claimed' };
  d.claimed[id] = true;
  state.gold = (state.gold || 0) + def.rewardGold;
  state.sparks = (state.sparks || 0) + def.rewardSparks;
  return { ok: true as const, gold: def.rewardGold, sparks: def.rewardSparks };
}

/** Newly completed dailies for toast. */
export function notifyDailyCompletions(state: any) {
  const d = dailyBag(state);
  const newly: DailyQuestDef[] = [];
  for (const q of DAILY_QUESTS) {
    const progress = d.progress[q.id] || 0;
    if (progress >= q.target && !d.notified[q.id]) {
      d.notified[q.id] = true;
      newly.push(q);
    }
  }
  return newly;
}
