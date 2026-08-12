import { MINEABLE, SMELT_RECIPES, BLUEPRINTS } from '../data/catalog.js';
import {
  addResource,
  createItemFromBlueprint,
  grantUsageXp,
  hasMats,
  inventoryCap,
  spendMats,
  countItems,
} from './state.js';

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

export function tickJobs(state, now = Date.now()) {
  const done = [];

  // Mine / smelt
  const keepMine = [];
  for (const job of state.mine.jobs) {
    if (job.endsAt <= now) {
      if (job.type === 'mine') {
        const amt = 3 + (state.mine.levels[job.resource] || 1);
        addResource(state, job.resource, amt);
        grantUsageXp(state, 'mine', job.resource, 1);
        done.push({ kind: 'mine', resource: job.resource, amount: amt });
      } else if (job.type === 'smelt') {
        const recipe = SMELT_RECIPES[job.recipeId];
        if (recipe) {
          addResource(state, recipe.output, recipe.amount);
          grantUsageXp(state, 'mine', recipe.output, 1);
          done.push({ kind: 'smelt', resource: recipe.output, amount: recipe.amount });
        }
      }
    } else keepMine.push(job);
  }
  state.mine.jobs = keepMine;

  // Forge crafts
  const keepForge = [];
  for (const job of state.forge.jobs) {
    if (job.endsAt <= now) {
      if (countItems(state) >= inventoryCap(state)) {
        // push 30s later if full
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
        done.push({ kind: 'craft', itemId: item.id, rarity: item.rarity });
      }
    } else keepForge.push(job);
  }
  state.forge.jobs = keepForge;

  // Research
  if (state.research.queue && state.research.queue.endsAt <= now) {
    const { blueprintId } = state.research.queue;
    if (!state.research.unlocked.includes(blueprintId)) state.research.unlocked.push(blueprintId);
    done.push({ kind: 'research', blueprintId });
    state.research.queue = null;
  }

  return done;
}

export function startMineJob(state, resource, seconds = null) {
  if (!MINEABLE.includes(resource)) return { ok: false, err: 'bad_res' };
  const slot = freeMineSlot(state);
  if (slot < 0) return { ok: false, err: 'no_slot' };
  const tier = 1 + (MINEABLE.indexOf(resource) % 5);
  const base = seconds ?? Math.min(25 * 60, 90 + tier * 45);
  // short timers: 5–30 min design goal; prototype uses shorter for testing
  const dur = Math.min(30 * 60 * 1000, base * 1000 * 0.15); // 15% for playable pace in prototype
  state.mine.jobs.push({
    slot,
    type: 'mine',
    resource,
    endsAt: Date.now() + dur,
    duration: dur,
  });
  return { ok: true, endsAt: Date.now() + dur };
}

export function startSmeltJob(state, recipeId) {
  const recipe = SMELT_RECIPES[recipeId];
  if (!recipe) return { ok: false, err: 'bad_recipe' };
  if (!hasMats(state, recipe.input)) return { ok: false, err: 'no_mats' };
  const slot = freeMineSlot(state);
  if (slot < 0) return { ok: false, err: 'no_slot' };
  spendMats(state, recipe.input);
  const dur = Math.min(15 * 60 * 1000, recipe.seconds * 1000 * 0.2);
  state.mine.jobs.push({
    slot,
    type: 'smelt',
    recipeId,
    endsAt: Date.now() + dur,
    duration: dur,
  });
  return { ok: true };
}

export function startCraftJob(state, blueprintId) {
  const bp = BLUEPRINTS[blueprintId];
  if (!bp) return { ok: false, err: 'bad_bp' };
  if (!state.research.unlocked.includes(blueprintId)) return { ok: false, err: 'locked' };
  if (!hasMats(state, bp.cost)) return { ok: false, err: 'no_mats' };
  if (countItems(state) >= inventoryCap(state)) return { ok: false, err: 'inv_full' };
  const slot = freeForgeSlot(state);
  if (slot < 0) return { ok: false, err: 'no_slot' };
  spendMats(state, bp.cost);
  const branchLvl = state.forge.branches[bp.branch]?.level || 1;
  const dur = Math.min(20 * 60 * 1000, (bp.craftSeconds || 40) * 1000 * 0.2);
  state.forge.jobs.push({
    slot,
    type: 'craft',
    blueprintId,
    endsAt: Date.now() + dur,
    duration: dur,
    branchLvl,
  });
  return { ok: true };
}

export function startResearch(state, tech) {
  if (state.research.queue) return { ok: false, err: 'busy' };
  if (state.research.unlocked.includes(tech.blueprintId)) return { ok: false, err: 'done' };
  if (state.gold < tech.gold) return { ok: false, err: 'no_gold' };
  state.gold -= tech.gold;
  const dur = Math.min(20 * 60 * 1000, tech.seconds * 1000 * 0.25);
  state.research.queue = {
    techId: tech.id,
    blueprintId: tech.blueprintId,
    endsAt: Date.now() + dur,
    duration: dur,
  };
  return { ok: true };
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
