import { DIFFICULTY_MULT, REGIONS } from './catalog';

/** Flat campaign spine — linear unlock order. */
export function allMissionsInOrder() {
  const list = [];
  for (const region of REGIONS) {
    for (const m of region.missions) {
      list.push({
        ...m,
        regionId: region.id,
        regionOrder: region.order,
      });
    }
  }
  return list;
}

export function findMissionEntry(missionId) {
  return allMissionsInOrder().find((m) => m.id === missionId) || null;
}

export function previousMissionId(missionId) {
  const all = allMissionsInOrder();
  const idx = all.findIndex((m) => m.id === missionId);
  if (idx <= 0) return null;
  return all[idx - 1].id;
}

export function nextMissionId(missionId) {
  const all = allMissionsInOrder();
  const idx = all.findIndex((m) => m.id === missionId);
  if (idx < 0 || idx >= all.length - 1) return null;
  return all[idx + 1].id;
}

/** Linear story: mission N opens only after N-1 is cleared. First is always open. */
export function isMissionUnlocked(state, missionId) {
  const all = allMissionsInOrder();
  const idx = all.findIndex((m) => m.id === missionId);
  if (idx < 0) return false;
  if (idx === 0) return true;
  const prev = all[idx - 1];
  return !!(state.campaign?.cleared && state.campaign.cleared[prev.id]);
}

export function campaignProgress(state) {
  const all = allMissionsInOrder();
  const cleared = all.filter((m) => state.campaign?.cleared?.[m.id]).length;
  let next = null;
  for (const m of all) {
    if (!state.campaign?.cleared?.[m.id] && isMissionUnlocked(state, m.id)) {
      next = m;
      break;
    }
  }
  return {
    total: all.length,
    cleared,
    next,
    percent: all.length ? Math.round((cleared / all.length) * 100) : 0,
  };
}

export function ensureCampaignProgress(state) {
  if (!state.campaign) state.campaign = { cleared: {}, unlockedRegions: ['fields'] };
  if (!state.campaign.cleared) state.campaign.cleared = {};
  if (!state.campaign.unlockedRegions) state.campaign.unlockedRegions = ['fields'];
  // Sync region unlocks from linear clear (boss / unlockAfter)
  for (const r of REGIONS) {
    if (!r.unlockAfter) {
      if (!state.campaign.unlockedRegions.includes(r.id)) state.campaign.unlockedRegions.push(r.id);
      continue;
    }
    if (state.campaign.cleared[r.unlockAfter] && !state.campaign.unlockedRegions.includes(r.id)) {
      state.campaign.unlockedRegions.push(r.id);
    }
  }
  return state;
}

export function storyIntroKey(missionId) {
  return `intro_${missionId}`;
}

export function storyOutroKey(missionId) {
  return `outro_${missionId}`;
}

/**
 * Session-planning estimate for a mission (~minutes of play).
 * Scales with foe count and boss fights so players can fit a 15–30 min session.
 */
export function missionEtaMinutes(mission) {
  if (!mission) return 5;
  const enemies = Number(mission.enemies) || 2;
  const bossExtra = mission.boss ? 3 : 0;
  return Math.max(5, Math.round(3.5 + enemies * 1.15 + bossExtra));
}

/** Preview of catalog rewards for a difficulty (matches battle rewardMult). */
export function missionRewardPreview(mission, difficulty = 'normal') {
  if (!mission?.reward) return {};
  const mult = (DIFFICULTY_MULT[difficulty] || DIFFICULTY_MULT.normal)?.reward || 1;
  /** @type {Record<string, number>} */
  const out = {};
  for (const [k, v] of Object.entries(mission.reward)) {
    out[k] = Math.round(Number(v) * mult);
  }
  return out;
}
