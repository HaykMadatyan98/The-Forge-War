import { BLUEPRINTS, RESOURCES, MINEABLE, SMELT_RECIPES } from './catalog';

/** Hub stamina for economy jobs (mine / smelt / craft). */
export const ENERGY_MAX = 30;
/** 1 energy restored every N ms while below max. */
export const ENERGY_REGEN_MS = 2 * 60 * 1000; // 2 minutes per point
/** Energy from a single rewarded-ad claim. */
export const ENERGY_AD_AMOUNT = 5;
/** Max ad claims per calendar day. */
export const ENERGY_AD_DAILY_MAX = 5;
/** Sparks (premium) pack: cost → energy. */
export const ENERGY_SPARK_PACK = { sparks: 2, energy: 10 };

export function defaultEnergy(now = Date.now()) {
  return {
    current: ENERGY_MAX,
    max: ENERGY_MAX,
    lastTick: now,
    adsUsed: 0,
    adsDay: dayKey(now),
  };
}

export function dayKey(now = Date.now()) {
  const d = new Date(now);
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

export function ensureEnergy(state, now = Date.now()) {
  if (!state.energy) state.energy = defaultEnergy(now);
  const e = state.energy;
  if (e.max == null) e.max = ENERGY_MAX;
  if (e.current == null) e.current = e.max;
  if (e.lastTick == null) e.lastTick = now;
  if (e.adsUsed == null) e.adsUsed = 0;
  if (e.adsDay !== dayKey(now)) {
    e.adsDay = dayKey(now);
    e.adsUsed = 0;
  }
  return e;
}

/** Apply passive time regen. Call on hub tick / actions. */
export function tickEnergy(state, now = Date.now()) {
  const e = ensureEnergy(state, now);
  if (e.current >= e.max) {
    e.lastTick = now;
    return e;
  }
  const elapsed = Math.max(0, now - (e.lastTick || now));
  const gained = Math.floor(elapsed / ENERGY_REGEN_MS);
  if (gained > 0) {
    e.current = Math.min(e.max, e.current + gained);
    e.lastTick = (e.lastTick || now) + gained * ENERGY_REGEN_MS;
    if (e.current >= e.max) e.lastTick = now;
  }
  return e;
}

/** Ms until next free energy point (0 if full). */
export function energyRegenEta(state, now = Date.now()) {
  const e = tickEnergy(state, now);
  if (e.current >= e.max) return 0;
  const since = now - (e.lastTick || now);
  return Math.max(0, ENERGY_REGEN_MS - since);
}

export function energyCostForMine(resource) {
  const tier = RESOURCES[resource]?.tier || 1 + Math.max(0, MINEABLE.indexOf(resource) % 5);
  return Math.max(1, tier);
}

export function energyCostForSmelt(recipeId) {
  const recipe = typeof recipeId === 'string' ? SMELT_RECIPES[recipeId] : recipeId;
  if (!recipe) return 1;
  const tier = RESOURCES[recipe.output]?.tier || 1;
  return Math.max(1, tier);
}

export function energyCostForCraft(blueprintId) {
  const bp = typeof blueprintId === 'string' ? BLUEPRINTS[blueprintId] : blueprintId;
  const tier = bp?.tier || 1;
  return Math.max(1, tier);
}

export function hasEnergy(state, cost, now = Date.now()) {
  tickEnergy(state, now);
  return (state.energy?.current || 0) >= cost;
}

export function spendEnergy(state, cost, now = Date.now()) {
  if (cost <= 0) return { ok: true };
  tickEnergy(state, now);
  const e = ensureEnergy(state, now);
  if (e.current < cost) return { ok: false, err: 'no_energy', need: cost, have: e.current };
  e.current -= cost;
  // start regen clock when leaving full
  if (e.current < e.max && !e.lastTick) e.lastTick = now;
  return { ok: true, remaining: e.current };
}

/** Rewarded ad: +ENERGY_AD_AMOUNT, max ENERGY_AD_DAILY_MAX / day. */
export function claimEnergyAd(state, now = Date.now()) {
  tickEnergy(state, now);
  const e = ensureEnergy(state, now);
  if (e.adsUsed >= ENERGY_AD_DAILY_MAX) return { ok: false, err: 'ads_done', adsUsed: e.adsUsed };
  e.adsUsed += 1;
  const before = e.current;
  e.current = Math.min(e.max, e.current + ENERGY_AD_AMOUNT);
  return {
    ok: true,
    gained: e.current - before,
    adsLeft: ENERGY_AD_DAILY_MAX - e.adsUsed,
    current: e.current,
  };
}

/** Buy energy pack with Sparks (donate currency). */
export function buyEnergyWithSparks(state, now = Date.now()) {
  tickEnergy(state, now);
  const e = ensureEnergy(state, now);
  const { sparks, energy } = ENERGY_SPARK_PACK;
  if ((state.sparks || 0) < sparks) return { ok: false, err: 'no_sparks', need: sparks };
  state.sparks -= sparks;
  const before = e.current;
  e.current = Math.min(e.max, e.current + energy);
  return { ok: true, gained: e.current - before, cost: sparks, current: e.current };
}

export function adsLeftToday(state, now = Date.now()) {
  ensureEnergy(state, now);
  return Math.max(0, ENERGY_AD_DAILY_MAX - (state.energy.adsUsed || 0));
}
