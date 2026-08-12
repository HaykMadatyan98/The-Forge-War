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

export type DailyTier = 'quick' | 'main';

export type DailyQuestDef = {
  id: DailyQuestId;
  labelKey: string;
  detailKey: string;
  tab: HubGuideTab | 'arena';
  target: number;
  rewardGold: number;
  rewardSparks: number;
  /** quick = short economy tasks; main = combat session goals */
  tier: DailyTier;
};

/** 3 quick + 2 main — sized for 15–30 min sessions. */
export const DAILY_QUESTS: DailyQuestDef[] = [
  {
    id: 'daily_mine',
    labelKey: 'dailyMine',
    detailKey: 'dailyMineDetail',
    tab: 'mine',
    target: 2,
    rewardGold: 20,
    rewardSparks: 1,
    tier: 'quick',
  },
  {
    id: 'daily_craft',
    labelKey: 'dailyCraft',
    detailKey: 'dailyCraftDetail',
    tab: 'forge',
    target: 1,
    rewardGold: 25,
    rewardSparks: 1,
    tier: 'quick',
  },
  {
    id: 'daily_smelt',
    labelKey: 'dailySmelt',
    detailKey: 'dailySmeltDetail',
    tab: 'mine',
    target: 1,
    rewardGold: 18,
    rewardSparks: 1,
    tier: 'quick',
  },
  {
    id: 'daily_campaign',
    labelKey: 'dailyCampaign',
    detailKey: 'dailyCampaignDetail',
    tab: 'campaign',
    target: 1,
    rewardGold: 40,
    rewardSparks: 2,
    tier: 'main',
  },
  {
    id: 'daily_live',
    labelKey: 'dailyLive',
    detailKey: 'dailyLiveDetail',
    tab: 'arena',
    target: 1,
    rewardGold: 50,
    rewardSparks: 2,
    tier: 'main',
  },
];

/** Legacy ids still accepted by bumpDaily so old call sites don't break. */
const LEGACY_DAILY_ALIASES: Partial<Record<DailyQuestId, DailyQuestId>> = {
  daily_pvp: 'daily_live',
  daily_research: 'daily_craft',
};

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
  const mapped = LEGACY_DAILY_ALIASES[id] || id;
  const d = dailyBag(state);
  const def = DAILY_QUESTS.find((q) => q.id === mapped);
  if (!def) return;
  d.progress[mapped] = Math.min(def.target, (d.progress[mapped] || 0) + amount);
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

export function dailyListByTier(state: any) {
  const list = dailyList(state);
  return {
    quick: list.filter((q) => q.tier === 'quick'),
    main: list.filter((q) => q.tier === 'main'),
    list,
  };
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
