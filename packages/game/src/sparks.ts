/**
 * Sparks = soft premium / QoL currency.
 * Allowed sinks: timer skips, energy packs, extra economy slots, portrait frames.
 * Must never affect combat stats or PvP matchmaking power.
 */

export const SPARK_SLOT_COST = 5;
export const SPARK_SLOT_MAX_TOTAL = 6;

export const PORTRAIT_FRAMES = [
  { id: 'none', cost: 0, labelKey: 'frameNone' },
  { id: 'bronze', cost: 3, labelKey: 'frameBronze' },
  { id: 'ember', cost: 8, labelKey: 'frameEmber' },
  { id: 'mythril', cost: 15, labelKey: 'frameMythril' },
] as const;

export type PortraitFrameId = (typeof PORTRAIT_FRAMES)[number]['id'];

export function ensureCosmetics(state: any) {
  if (!state.cosmetics) {
    state.cosmetics = { frames: ['none'], frame: 'none' };
  }
  if (!Array.isArray(state.cosmetics.frames)) state.cosmetics.frames = ['none'];
  if (!state.cosmetics.frames.includes('none')) state.cosmetics.frames.unshift('none');
  if (!state.cosmetics.frame) state.cosmetics.frame = 'none';
  if (!state.mine) state.mine = {};
  if (!state.forge) state.forge = {};
  if (state.mine.boughtSlots == null) state.mine.boughtSlots = 0;
  if (state.forge.boughtSlots == null) state.forge.boughtSlots = 0;
  return state.cosmetics;
}

export function effectiveMineSlots(state: any) {
  const base = state.mine?.slots || 1;
  const bought = state.mine?.boughtSlots || 0;
  return Math.min(SPARK_SLOT_MAX_TOTAL, base + bought);
}

export function effectiveForgeSlots(state: any) {
  const base = state.forge?.slots || 1;
  const bought = state.forge?.boughtSlots || 0;
  return Math.min(SPARK_SLOT_MAX_TOTAL, base + bought);
}

export function buyEconomySlot(state: any, domain: 'mine' | 'forge') {
  ensureCosmetics(state);
  const bag = domain === 'mine' ? state.mine : state.forge;
  if (!bag) return { ok: false as const, err: 'bad_domain' };
  const current = domain === 'mine' ? effectiveMineSlots(state) : effectiveForgeSlots(state);
  if (current >= SPARK_SLOT_MAX_TOTAL) return { ok: false as const, err: 'max_slots', cost: SPARK_SLOT_COST };
  if ((state.sparks || 0) < SPARK_SLOT_COST) {
    return { ok: false as const, err: 'no_sparks', cost: SPARK_SLOT_COST };
  }
  state.sparks -= SPARK_SLOT_COST;
  bag.boughtSlots = (bag.boughtSlots || 0) + 1;
  return {
    ok: true as const,
    cost: SPARK_SLOT_COST,
    slots: domain === 'mine' ? effectiveMineSlots(state) : effectiveForgeSlots(state),
  };
}

export function unlockPortraitFrame(state: any, frameId: string) {
  ensureCosmetics(state);
  const def = PORTRAIT_FRAMES.find((f) => f.id === frameId);
  if (!def) return { ok: false as const, err: 'bad_frame' };
  if (state.cosmetics.frames.includes(frameId)) {
    state.cosmetics.frame = frameId;
    return { ok: true as const, cost: 0, already: true as const };
  }
  if (def.cost > 0 && (state.sparks || 0) < def.cost) {
    return { ok: false as const, err: 'no_sparks', cost: def.cost };
  }
  if (def.cost > 0) state.sparks -= def.cost;
  state.cosmetics.frames.push(frameId);
  state.cosmetics.frame = frameId;
  return { ok: true as const, cost: def.cost, already: false as const };
}

export function setPortraitFrame(state: any, frameId: string) {
  ensureCosmetics(state);
  if (!state.cosmetics.frames.includes(frameId)) return { ok: false as const, err: 'locked' };
  state.cosmetics.frame = frameId;
  return { ok: true as const };
}

/** Client mirror of live matchmaking rating window. */
export function liveMatchWindow(waitMs: number) {
  if (waitMs > 60_000) return { window: null as number | null, labelKey: 'livePvpWindowAny' as const };
  if (waitMs > 30_000) return { window: 400, labelKey: 'livePvpWindow400' as const };
  return { window: 200, labelKey: 'livePvpWindow200' as const };
}
