import { MINEABLE, SMELT_RECIPES, BLUEPRINTS, RESOURCES } from './catalog';
import {
  addResource,
  createItemFromBlueprint,
  grantUsageXp,
  hasMats,
  inventoryCap,
  spendMats,
  countItems,
  unlockFromBlueprintResearch,
} from './state';
import {
  energyCostForCraft,
  energyCostForMine,
  energyCostForSmelt,
  spendEnergy,
  tickEnergy,
} from './energy';

function freeMineSlot(state) {
  const used = new Set(state.mine.jobs.map((j) => j.slot));
  for (let i = 0; i < state.mine.slots; i++) if (!used.has(i)) return i;
  return -1;
}

function freeForgeSlot(state) {
  const used = new Set(state.forge.jobs.map((j) => j.slot));
  for (let i = 0; i < state.forge.slots; i++) if (!used.has(i)) return i;
  return -1;
}

/** Lower tier finishes faster (first-hour craft is near-instant). */
export function tierSpeedMult(tier = 1) {
  const t = Math.max(1, Math.min(5, Number(tier) || 1));
  return { 1: 0.06, 2: 0.11, 3: 0.17, 4: 0.26, 5: 0.38 }[t] || 0.15;
}

export function craftJobDurationMs(bp) {
  const sec = bp?.craftSeconds || 40;
  const mult = tierSpeedMult(bp?.tier || 1);
  return Math.min(15 * 60 * 1000, Math.max(1800, Math.round(sec * 1000 * mult)));
}

export function smeltJobDurationMs(recipe) {
  const sec = recipe?.seconds || 30;
  const out = recipe?.output;
  const tier = (out && RESOURCES[out]?.tier) || 1;
  return Math.min(12 * 60 * 1000, Math.max(1500, Math.round(sec * 1000 * tierSpeedMult(tier))));
}

export function mineJobDurationMs(resource, baseSec = undefined) {
  const tier = RESOURCES[resource]?.tier || 1 + (MINEABLE.indexOf(resource) % 5);
  const base = baseSec ?? 90 + tier * 45;
  return Math.min(12 * 60 * 1000, Math.max(2000, Math.round(base * 1000 * tierSpeedMult(tier) * 0.9)));
}

export function researchJobDurationMs(tech) {
  const sec = tech?.seconds || 60;
  const bp = BLUEPRINTS[tech?.blueprintId];
  const tier = bp?.tier || 1;
  return Math.min(15 * 60 * 1000, Math.max(2500, Math.round(sec * 1000 * tierSpeedMult(tier) * 1.1)));
}

/** Sparks to finish a job now (premium skip). */
export function skipSparkCost(job, now = Date.now()) {
  if (!job?.endsAt) return 0;
  const left = Math.max(0, job.endsAt - now);
  if (left <= 0) return 0;
  const tier = job.tier || 1;
  return Math.max(1, Math.ceil(left / 30000) + Math.max(0, tier - 1));
}

/**
 * Instant-finish a job by spending Sparks.
 * domain: 'mine' | 'forge' | 'research'
 * index: job index in the queue (0 for research)
 */
export function skipJobWithSparks(state, domain, index = 0, now = Date.now()) {
  let job = null;
  if (domain === 'mine') job = state.mine?.jobs?.[index];
  else if (domain === 'forge') job = state.forge?.jobs?.[index];
  else if (domain === 'research') job = state.research?.queue;
  else return { ok: false, err: 'bad_domain' };

  if (!job) return { ok: false, err: 'no_job' };
  if (job.endsAt <= now) return { ok: false, err: 'already' };

  const cost = skipSparkCost(job, now);
  if ((state.sparks || 0) < cost) return { ok: false, err: 'no_sparks', cost };

  state.sparks = (state.sparks || 0) - cost;
  job.endsAt = now;
  job.skipped = true;
  return { ok: true, cost, domain };
}

export function tickJobs(state, now = Date.now()) {
  tickEnergy(state, now);
  const done = [];

  const keepMine = [];
  for (const job of state.mine.jobs) {
    if (job.endsAt <= now) {
      if (job.type === 'mine') {
        const amt = job.amount ?? mineYieldAmount(state, job.resource);
        addResource(state, job.resource, amt);
        grantUsageXp(state, 'mine', job.resource, 1);
        done.push({ kind: 'mine', resource: job.resource, amount: amt, duration: job.duration || 0 });
      } else if (job.type === 'smelt') {
        const recipe = SMELT_RECIPES[job.recipeId];
        if (recipe) {
          addResource(state, recipe.output, recipe.amount);
          grantUsageXp(state, 'mine', recipe.output, 1);
          done.push({ kind: 'smelt', resource: recipe.output, amount: recipe.amount, duration: job.duration || 0 });
        }
      }
    } else keepMine.push(job);
  }
  state.mine.jobs = keepMine;

  const keepForge = [];
  for (const job of state.forge.jobs) {
    if (job.endsAt <= now) {
      if (countItems(state) >= inventoryCap(state)) {
        job.endsAt = now + 30_000;
        keepForge.push(job);
        continue;
      }
      const bp = BLUEPRINTS[job.blueprintId];
      const branch = bp?.branch || 'melee';
      const lvl = state.forge.branches[branch]?.level || 1;
      const item = createItemFromBlueprint(job.blueprintId, lvl);
      if (item) {
        state.items[item.id] = item;
        state.inventory.push(item.id);
        grantUsageXp(state, 'forge', branch, 1);
        done.push({ kind: 'craft', itemId: item.id, rarity: item.rarity, blueprintId: job.blueprintId, duration: job.duration || 0 });
      }
    } else keepForge.push(job);
  }
  state.forge.jobs = keepForge;

  if (state.research.queue && state.research.queue.endsAt <= now) {
    const { blueprintId } = state.research.queue;
    if (!state.research.unlocked.includes(blueprintId)) state.research.unlocked.push(blueprintId);
    const unlockedRes = unlockFromBlueprintResearch(state, blueprintId);
    done.push({ kind: 'research', blueprintId, unlockedResources: unlockedRes });
    state.research.queue = null;
  }

  return done;
}

export function startMineJob(state, resource, seconds = null) {
  if (!MINEABLE.includes(resource)) return { ok: false, err: 'bad_res' };
  const unlocked = state.unlockedResources || [];
  if (!unlocked.includes(resource)) return { ok: false, err: 'locked' };
  const slot = freeMineSlot(state);
  if (slot < 0) return { ok: false, err: 'no_slot' };
  const eneCost = energyCostForMine(resource);
  const spend = spendEnergy(state, eneCost);
  if (!spend.ok) return { ok: false, err: 'no_energy', need: eneCost, have: spend.have };
  const tier = RESOURCES[resource]?.tier || 1 + (MINEABLE.indexOf(resource) % 5);
  const base = seconds ?? 90 + tier * 45;
  const dur = mineJobDurationMs(resource, base);
  const amount = mineYieldAmount(state, resource);
  state.mine.jobs.push({
    slot,
    type: 'mine',
    resource,
    amount,
    tier,
    energyCost: eneCost,
    endsAt: Date.now() + dur,
    duration: dur,
  });
  return { ok: true, endsAt: Date.now() + dur, amount, duration: dur, energyCost: eneCost };
}

export function mineYieldAmount(state, resource) {
  const lvl = state.mine?.levels?.[resource] || 1;
  const clears = Object.keys(state.campaign?.cleared || {}).length;
  return 4 + lvl * 2 + Math.floor(clears / 5);
}

export function mineSlotsUsed(state) {
  return state.mine?.jobs?.length || 0;
}

export function forgeSlotsUsed(state) {
  return state.forge?.jobs?.length || 0;
}

export function startSmeltJob(state, recipeId) {
  const recipe = SMELT_RECIPES[recipeId];
  if (!recipe) return { ok: false, err: 'bad_recipe' };
  const unlocked = state.unlockedResources || [];
  if (!unlocked.includes(recipe.output) && !unlocked.includes(Object.keys(recipe.input)[0])) {
    return { ok: false, err: 'locked' };
  }
  if (!hasMats(state, recipe.input)) return { ok: false, err: 'no_mats' };
  const slot = freeMineSlot(state);
  if (slot < 0) return { ok: false, err: 'no_slot' };
  const eneCost = energyCostForSmelt(recipeId);
  const spend = spendEnergy(state, eneCost);
  if (!spend.ok) return { ok: false, err: 'no_energy', need: eneCost, have: spend.have };
  spendMats(state, recipe.input);
  const tier = RESOURCES[recipe.output]?.tier || 1;
  const dur = smeltJobDurationMs(recipe);
  state.mine.jobs.push({
    slot,
    type: 'smelt',
    recipeId,
    tier,
    energyCost: eneCost,
    endsAt: Date.now() + dur,
    duration: dur,
  });
  return { ok: true, duration: dur, energyCost: eneCost };
}

export function startCraftJob(state, blueprintId) {
  const bp = BLUEPRINTS[blueprintId];
  if (!bp) return { ok: false, err: 'bad_bp' };
  if (!state.research.unlocked.includes(blueprintId)) return { ok: false, err: 'locked' };
  if (!hasMats(state, bp.cost)) return { ok: false, err: 'no_mats' };
  if (countItems(state) >= inventoryCap(state)) return { ok: false, err: 'inv_full' };
  const slot = freeForgeSlot(state);
  if (slot < 0) return { ok: false, err: 'no_slot' };
  const eneCost = energyCostForCraft(blueprintId);
  const spend = spendEnergy(state, eneCost);
  if (!spend.ok) return { ok: false, err: 'no_energy', need: eneCost, have: spend.have };
  spendMats(state, bp.cost);
  const branchLvl = state.forge.branches[bp.branch]?.level || 1;
  const dur = craftJobDurationMs(bp);
  state.forge.jobs.push({
    slot,
    type: 'craft',
    blueprintId,
    tier: bp.tier || 1,
    energyCost: eneCost,
    endsAt: Date.now() + dur,
    duration: dur,
    branchLvl,
  });
  return { ok: true, duration: dur, energyCost: eneCost };
}

export function startResearch(state, tech) {
  if (state.research.queue) return { ok: false, err: 'busy' };
  if (state.research.unlocked.includes(tech.blueprintId)) return { ok: false, err: 'done' };
  if (state.gold < tech.gold) return { ok: false, err: 'no_gold' };
  state.gold -= tech.gold;
  const bp = BLUEPRINTS[tech.blueprintId];
  const dur = researchJobDurationMs(tech);
  state.research.queue = {
    techId: tech.id,
    blueprintId: tech.blueprintId,
    tier: bp?.tier || 1,
    endsAt: Date.now() + dur,
    duration: dur,
  };
  return { ok: true, duration: dur };
}

export function jobProgress(job, now = Date.now()) {
  if (!job) return 1;
  const total = job.duration || 1;
  const left = Math.max(0, job.endsAt - now);
  return 1 - left / total;
}

export function formatEta(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}
