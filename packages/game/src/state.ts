// @ts-nocheck
import {
  BARRACKS_DEPLOY,
  BARRACKS_ROSTER,
  BLUEPRINTS,
  GEAR_SLOTS,
  INVENTORY_BASE,
  RARITY_WEIGHTS_CRAFT_BASE,
  RARITY_WEIGHTS_RECRUIT,
  SMELT_RECIPES,
  STARTER_RESOURCE,
  STARTER_UNLOCKED_RESOURCES,
  TECH_TREE,
  WEAPON_PROFILES,
  WEAPON_TYPES,
  STAT_CAP,
} from './catalog';
import { ensureCampaignProgress } from './campaign';
import { defaultEnergy, ensureEnergy, tickEnergy } from './energy';

let _id = 1;
export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${_id++}`;
}

export function weightedPick(weights, rng = Math.random) {
  const entries = Object.entries(weights);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

export function rollRarity(stationLevel = 1, rng = Math.random) {
  const w = { ...RARITY_WEIGHTS_CRAFT_BASE };
  w.u += stationLevel * 1.5;
  w.r += stationLevel * 0.8;
  w.e += stationLevel * 0.2;
  return weightedPick(w, rng);
}

/** ±5% light RNG on numeric bases */
export function rollStats(base, rarity, rng = Math.random) {
  const rarBonus = { c: 1, u: 1.06, r: 1.14, e: 1.25 }[rarity] || 1;
  const out = {};
  for (const [k, v] of Object.entries(base || {})) {
    const variance = 0.95 + rng() * 0.1;
    out[k] = Math.max(1, Math.round(v * rarBonus * variance));
  }
  return out;
}

const FIRST_NAMES = {
  en: ['Ash', 'Bren', 'Cora', 'Dunn', 'Edda', 'Flint', 'Grit', 'Hale', 'Ivor', 'Joss', 'Kara', 'Lute', 'Mira', 'Noll', 'Orin', 'Pike', 'Quinn', 'Rook', 'Sera', 'Tor', 'Vale', 'Wren'],
  ru: ['Аш', 'Бренн', 'Кора', 'Данн', 'Эдда', 'Флинт', 'Грит', 'Хейл', 'Ивор', 'Джосс', 'Кара', 'Лют', 'Мира', 'Нолл', 'Орин', 'Пайк', 'Квинн', 'Рук', 'Сера', 'Тор', 'Вейл', 'Рен'],
};
const LAST_NAMES = {
  en: ['Forge', 'Thorn', 'Reed', 'Stone', 'Ashen', 'Crowe', 'Vale', 'Hart', 'Boone', 'Pike', 'Marlow', 'Shaw'],
  ru: ['Кузнец', 'Шип', 'Трост', 'Камень', 'Пепельный', 'Ворон', 'Долин', 'Олень', 'Бун', 'Пик', 'Марло', 'Шоу'],
};

export function rollWarriorName(lang = 'en', rng = Math.random) {
  const first = FIRST_NAMES[lang] || FIRST_NAMES.en;
  const last = LAST_NAMES[lang] || LAST_NAMES.en;
  return `${first[Math.floor(rng() * first.length)]} ${last[Math.floor(rng() * last.length)]}`;
}

/** Total random budget for recruit base stats by rarity (does not include move). */
export const RECRUIT_STAT_POOL = {
  c: 30, // common
  u: 40, // uncommon
  r: 50, // rare
  e: 65, // epic
};

/** Stats that share the recruit point pool. */
const RECRUIT_POOL_KEYS = ['hp', 'atk', 'def', 'spd', 'acc', 'eva', 'crit', 'blk', 'sta'];

/**
 * Random base combat stats from a rarity point pool.
 * Floors keep recruits usable; pool points are scattered randomly (not class-biased).
 */
export function rollRecruitBaseStats(rarity = 'c', rng = Math.random) {
  const pool = RECRUIT_STAT_POOL[rarity] || RECRUIT_STAT_POOL.c;
  const floor = {
    hp: 16,
    atk: 2,
    def: 2,
    spd: 3,
    acc: 3,
    eva: 1,
    crit: 1,
    blk: 0,
    sta: 16,
  };
  const spent = Object.fromEntries(RECRUIT_POOL_KEYS.map((k) => [k, 0]));
  for (let i = 0; i < pool; i++) {
    const k = RECRUIT_POOL_KEYS[Math.floor(rng() * RECRUIT_POOL_KEYS.length)];
    spent[k] += 1;
  }
  // Soft-cap one dump-stat so no free 30-into-atk monsters
  for (const k of RECRUIT_POOL_KEYS) {
    const soft = k === 'hp' || k === 'sta' ? Math.ceil(pool * 0.45) : Math.ceil(pool * 0.35);
    if (spent[k] > soft) {
      const overflow = spent[k] - soft;
      spent[k] = soft;
      for (let o = 0; o < overflow; o++) {
        const t = RECRUIT_POOL_KEYS[Math.floor(rng() * RECRUIT_POOL_KEYS.length)];
        if (t !== k) spent[t] += 1;
        else spent.def += 1;
      }
    }
  }

  const base = {
    // hp / sta: 1 pool point → +2 so the budget feels meaningful
    hp: floor.hp + spent.hp * 2,
    atk: floor.atk + spent.atk,
    def: floor.def + spent.def,
    spd: floor.spd + spent.spd,
    acc: floor.acc + spent.acc,
    eva: floor.eva + spent.eva,
    crit: floor.crit + spent.crit,
    blk: floor.blk + spent.blk,
    sta: floor.sta + spent.sta * 2,
    // move is not in the pool — light random each hire
    move: 3 + Math.floor(rng() * 3), // 3–5
  };

  // clamp combat stats into a sane band
  for (const k of ['atk', 'def', 'spd', 'acc', 'eva', 'crit', 'blk']) {
    base[k] = Math.min(STAT_CAP, Math.max(0, base[k]));
  }
  base.hp = Math.min(120, Math.max(14, base.hp));
  base.sta = Math.min(80, Math.max(14, base.sta));
  base.move = Math.min(6, Math.max(3, base.move));
  return base;
}

export function createWarrior(opts = {}) {
  const rng = opts.rng || Math.random;
  const lang = opts.lang || 'en';
  const rarity = opts.rarity || weightedPick(RARITY_WEIGHTS_RECRUIT, rng);
  // explicit base only for tests / forced loadouts — hires use full random pool
  const base = opts.base || rollRecruitBaseStats(rarity, rng);
  const name = opts.name || rollWarriorName(lang, rng);
  const portraitSeed = opts.portraitSeed ?? Math.floor(rng() * 100000);

  const mastery = {};
  for (const wt of WEAPON_TYPES) mastery[wt] = { stars: 0, xp: 0 };
  // Mastery seeds by rarity — specialty is random (not a class)
  const biasStars = { c: 1, u: 2, r: 3, e: 4 }[rarity] || 1;
  const primary =
    opts.masteryBias || WEAPON_TYPES[Math.floor(rng() * WEAPON_TYPES.length)] || 'sword';
  mastery[primary] = { stars: biasStars, xp: 0 };
  // One secondary at least 1★ for variety
  let secondary = WEAPON_TYPES[Math.floor(rng() * WEAPON_TYPES.length)];
  if (secondary === primary) secondary = WEAPON_TYPES[(WEAPON_TYPES.indexOf(primary) + 1) % WEAPON_TYPES.length];
  mastery[secondary] = { stars: Math.max(1, biasStars - 1), xp: 0 };

  return {
    id: uid('w'),
    name,
    portraitSeed,
    rarity,
    level: 1,
    xp: 0,
    freePoints: 0,
    base,
    points: { hp: 0, atk: 0, def: 0, spd: 0, acc: 0, eva: 0, crit: 0, blk: 0, sta: 0 },
    mastery,
    // Hires and starters arrive unarmed — forge then equip
    equip: { weapon: null, offhand: null, helm: null, body: null, legs: null, accessory: null },
  };
}

export function emptyEquip() {
  return Object.fromEntries(GEAR_SLOTS.map((s) => [s, null]));
}

export function createItemFromBlueprint(bpId, stationLevel = 1, rng = Math.random) {
  const bp = BLUEPRINTS[bpId];
  if (!bp) return null;
  const rarity = rollRarity(stationLevel, rng);
  const stats = rollStats(bp.base, rarity, rng);
  return {
    id: uid('item'),
    blueprintId: bpId,
    slot: bp.slot,
    weaponType: bp.weaponType || null,
    branch: bp.branch,
    rarity,
    stats,
    nameKey: bpId,
  };
}

export function effectiveStats(warrior, itemsById) {
  const s = {
    hp: warrior.base.hp + (warrior.points.hp || 0) * 3,
    atk: warrior.base.atk + (warrior.points.atk || 0),
    def: warrior.base.def + (warrior.points.def || 0),
    spd: warrior.base.spd + (warrior.points.spd || 0),
    acc: warrior.base.acc + (warrior.points.acc || 0),
    eva: warrior.base.eva + (warrior.points.eva || 0),
    crit: warrior.base.crit + (warrior.points.crit || 0),
    blk: warrior.base.blk + (warrior.points.blk || 0),
    sta: warrior.base.sta + (warrior.points.sta || 0) * 2,
    move: warrior.base.move,
  };
  for (const slot of GEAR_SLOTS) {
    const id = warrior.equip[slot];
    if (!id) continue;
    const it = itemsById[id];
    if (!it) continue;
    for (const [k, v] of Object.entries(it.stats || {})) {
      if (k === 'hp') s.hp += v;
      else if (k in s) s[k] += v;
    }
    if (it.weaponType && WEAPON_PROFILES[it.weaponType]?.hands === 2) {
      // great weapons already stronger via profile in combat
    }
  }
  // hard soft-cap feel
  for (const k of ['atk', 'def', 'spd', 'acc', 'eva', 'crit', 'blk']) {
    s[k] = Math.min(STAT_CAP + 10, s[k]);
  }
  return s;
}

/** Equipped weapon type, or null if the warrior fights bare-handed. */
export function equippedWeaponType(warrior, itemsById) {
  if (!warrior?.equip) return null;
  const map = itemsById || {};
  const w = warrior.equip.weapon && map[warrior.equip.weapon];
  if (w?.weaponType) return w.weaponType;
  const oh = warrior.equip.offhand && map[warrior.equip.offhand];
  if (oh?.weaponType === 'shield') return 'shield';
  return null;
}

/** Combat / UI weapon id — `'unarmed'` when nothing is equipped. */
export function primaryWeaponType(warrior, itemsById) {
  return equippedWeaponType(warrior, itemsById) || 'unarmed';
}

export function isUnarmed(warrior, itemsById) {
  return !equippedWeaponType(warrior, itemsById);
}

export function countUnarmedWarriors(state) {
  return (state?.warriors || []).filter((w) => isUnarmed(w, state.items)).length;
}

/** Loose weapons in inventory not on anyone. */
export function freeWeaponCount(state) {
  const used = new Set();
  for (const w of state?.warriors || []) {
    for (const sl of GEAR_SLOTS) {
      const id = w.equip?.[sl];
      if (id) used.add(id);
    }
  }
  return (state?.inventory || []).filter((id) => {
    if (used.has(id)) return false;
    return state.items?.[id]?.slot === 'weapon';
  }).length;
}

export function canCraftWeapon(state) {
  const slots = Math.min(6, (state.forge?.slots || 1) + (state.forge?.boughtSlots || 0));
  if (forgeSlotsUsedSafe(state) >= slots) return false;
  for (const id of state.research?.unlocked || []) {
    const bp = BLUEPRINTS[id];
    if (!bp || bp.slot !== 'weapon') continue;
    if (hasMats(state, bp.cost)) return true;
  }
  return false;
}

function forgeSlotsUsedSafe(state) {
  try {
    // jobs.js is imported late by callers — avoid circular import if forge empty
    return (state.forge?.jobs || []).length;
  } catch {
    return 0;
  }
}

export function canEquipHands(warrior, item, itemsById) {
  if (!item) return true;
  if (item.slot === 'weapon') {
    const prof = WEAPON_PROFILES[item.weaponType];
    if (prof?.hands === 2) {
      // need free offhand
      return !warrior.equip.offhand;
    }
  }
  if (item.slot === 'offhand') {
    const w = warrior.equip.weapon && itemsById[warrior.equip.weapon];
    if (w && WEAPON_PROFILES[w.weaponType]?.hands === 2) return false;
  }
  return true;
}

export function createInitialState(lang = 'en') {
  const res = { ...STARTER_RESOURCE };
  const w1 = createWarrior({
    lang,
    rarity: 'u',
    name: lang === 'ru' ? 'Бренн Кузнец' : 'Brenn Forge',
    portraitSeed: 11,
    masteryBias: 'sword',
  });
  const w2 = createWarrior({
    lang,
    rarity: 'u',
    name: lang === 'ru' ? 'Сера Трост' : 'Sera Reed',
    portraitSeed: 42,
    masteryBias: 'bow',
  });
  w1.mastery.sword = { stars: 3, xp: 0 };
  w1.mastery.axemace = { stars: 2, xp: 0 };
  w1.mastery.shield = { stars: 1, xp: 0 };
  w2.mastery.bow = { stars: 3, xp: 0 };
  w2.mastery.crossbow = { stars: 2, xp: 0 };
  w2.mastery.thrown = { stars: 1, xp: 0 };

  // No prebuilt gear — smith forges weapons, then barracks equips
  const items = {};

  const unlockedBlueprints = Object.values(BLUEPRINTS)
    .filter((b) => b.unlock)
    .map((b) => b.id);

  return {
    version: 2,
    lang,
    gold: res.gold,
    sparks: res.sparks,
    resources: Object.fromEntries(
      Object.keys(res)
        .filter((k) => k !== 'gold' && k !== 'sparks')
        .map((k) => [k, res[k]]),
    ),
    inventory: [],
    items,
    warriors: [w1, w2],
    barracksLevel: 1,
    mine: {
      slots: 1,
      usageXp: {},
      levels: {},
      jobs: [],
    },
    forge: {
      slots: 1,
      branches: {
        melee: { level: 1, xp: 0 },
        pole: { level: 1, xp: 0 },
        ranged: { level: 1, xp: 0 },
        armor: { level: 1, xp: 0 },
      },
      jobs: [],
    },
    research: {
      unlocked: unlockedBlueprints,
      queue: null,
    },
    unlockedResources: [...STARTER_UNLOCKED_RESOURCES],
    campaign: {
      cleared: {},
      unlockedRegions: ['fields'],
    },
    flags: { tutorialSeen: false, loopSeen: false, quests: { done: {}, claimed: {} } },
    energy: defaultEnergy(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function isResourceUnlocked(state, key) {
  return (state.unlockedResources || STARTER_UNLOCKED_RESOURCES).includes(key);
}

export function unlockResources(state, keys = []) {
  if (!state.unlockedResources) state.unlockedResources = [...STARTER_UNLOCKED_RESOURCES];
  const added = [];
  for (const k of keys) {
    if (!k || state.unlockedResources.includes(k)) continue;
    state.unlockedResources.push(k);
    added.push(k);
  }
  return added;
}

/** Unlock materials when a blueprint is researched (not via campaign). */
export function unlockFromBlueprintResearch(state, blueprintId) {
  const bp = BLUEPRINTS[blueprintId];
  const added = [];
  if (!bp) return added;
  const keys = new Set(Object.keys(bp.cost || {}));
  // produce chain: if cost uses a refined output, unlock its raw inputs too
  for (const recipe of Object.values(SMELT_RECIPES)) {
    if (keys.has(recipe.output)) {
      keys.add(recipe.output);
      for (const input of Object.keys(recipe.input || {})) keys.add(input);
    }
  }
  // tier resource packs (progressive content through research)
  const tierPacks = {
    2: ['iron_ore', 'coal', 'hardwood', 'wolf_hide', 'iron_bar', 'hardwood_plank', 'wolf_leather'],
    3: ['ashwood', 'boar_hide', 'steel_ore', 'ash_plank', 'boar_leather', 'steel_bar'],
    4: ['ironwood', 'bear_hide', 'yew', 'mythril_ore', 'ironwood_plank', 'bear_leather', 'yew_plank', 'mythril_bar'],
    5: ['wyrm_scale', 'wyrm_leather'],
  };
  for (const k of tierPacks[bp.tier] || []) keys.add(k);
  added.push(...unlockResources(state, [...keys]));
  return added;
}

/** Migrate older saves */
export function migrateState(state) {
  if (!state) return state;
  if (!state.unlockedResources) state.unlockedResources = [...STARTER_UNLOCKED_RESOURCES];
  if (!state.resources) state.resources = {};
  if (!state.campaign) state.campaign = { cleared: {}, unlockedRegions: ['fields'] };
  if (!state.flags) state.flags = {};
  if (!state.flags.quests) state.flags.quests = { done: {}, claimed: {} };
  if (state.sparks == null) state.sparks = 0;
  if (state.flags.loopSeen == null) state.flags.loopSeen = !!state.campaign?.cleared && Object.keys(state.campaign.cleared).length > 0;
  if (!state.cosmetics) state.cosmetics = { frames: ['none'], frame: 'none' };
  if (!Array.isArray(state.cosmetics.frames)) state.cosmetics.frames = ['none'];
  if (state.mine && state.mine.boughtSlots == null) state.mine.boughtSlots = 0;
  if (state.forge && state.forge.boughtSlots == null) state.forge.boughtSlots = 0;
  ensureEnergy(state);
  tickEnergy(state);
  ensureCampaignProgress(state);
  for (const w of state.warriors || []) {
    // Drop cosmetic class templates from older saves
    if (w.template) delete w.template;
    if (w.portraitSeed == null) w.portraitSeed = Math.abs(hashCode(w.id || w.name || 'x')) % 100000;
    if (!w.mastery) w.mastery = {};
    let anyStars = false;
    for (const wt of WEAPON_TYPES) {
      if (!w.mastery[wt]) w.mastery[wt] = { stars: 0, xp: 0 };
      if ((w.mastery[wt].stars || 0) > 0) anyStars = true;
    }
    // Old saves with all-zero mastery: seed a random primary
    if (!anyStars) {
      const bias = WEAPON_TYPES[Math.abs(hashCode(w.id || w.name || 'x')) % WEAPON_TYPES.length];
      const rar = w.rarity || 'c';
      w.mastery[bias] = { stars: { c: 1, u: 2, r: 3, e: 4 }[rar] || 1, xp: w.mastery[bias]?.xp || 0 };
    }
    if (!w.points) w.points = { hp: 0, atk: 0, def: 0, spd: 0, acc: 0, eva: 0, crit: 0, blk: 0, sta: 0 };
    if (!w.equip) w.equip = emptyEquip();
    w.xp = Math.round(w.xp || 0);
    for (const wt of WEAPON_TYPES) {
      if (w.mastery[wt]) w.mastery[wt].xp = Math.round(w.mastery[wt].xp || 0);
    }
  }
  state.version = Math.max(2, state.version || 1);
  return state;
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h;
}

export function deployCap(state) {
  return BARRACKS_DEPLOY[Math.min(state.barracksLevel, BARRACKS_DEPLOY.length) - 1];
}

export function rosterCap(state) {
  return BARRACKS_ROSTER[Math.min(state.barracksLevel, BARRACKS_ROSTER.length) - 1];
}

export function inventoryCap(state) {
  return INVENTORY_BASE + (state.barracksLevel - 1) * 10;
}

export function countItems(state) {
  return state.inventory.length;
}

export function hasMats(state, cost) {
  for (const [k, n] of Object.entries(cost || {})) {
    const have = k === 'gold' ? state.gold : state.resources[k] || 0;
    if (have < n) return false;
  }
  return true;
}

/** Per-resource cost status for UI (have / need / missing). */
export function matBreakdown(state, cost) {
  return Object.entries(cost || {}).map(([key, need]) => {
    const n = Number(need) || 0;
    const have = key === 'gold' ? state.gold || 0 : state.resources[key] || 0;
    const missing = Math.max(0, n - have);
    return { key, need: n, have, missing, ok: missing === 0 };
  });
}

export function missingMats(state, cost) {
  return matBreakdown(state, cost).filter((r) => !r.ok);
}

/** Sanitize XP / floats to whole numbers */
export function cleanXp(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

export function spendMats(state, cost) {
  for (const [k, n] of Object.entries(cost || {})) {
    if (k === 'gold') state.gold -= n;
    else state.resources[k] = (state.resources[k] || 0) - n;
  }
}

export function addResource(state, key, n) {
  if (key === 'gold') state.gold += n;
  else state.resources[key] = (state.resources[key] || 0) + n;
}

export function grantUsageXp(state, scope, key, amount = 1) {
  if (scope === 'mine') {
    state.mine.usageXp[key] = (state.mine.usageXp[key] || 0) + amount;
    const xp = state.mine.usageXp[key];
    const lvl = 1 + Math.floor(xp / 8);
    state.mine.levels[key] = Math.min(10, lvl);
    // slot unlock
    const total = Object.values(state.mine.usageXp).reduce((a, b) => a + b, 0);
    state.mine.slots = Math.min(4, 1 + Math.floor(total / 18));
  } else if (scope === 'forge') {
    const b = state.forge.branches[key];
    if (!b) return;
    b.xp += amount;
    b.level = Math.min(10, 1 + Math.floor(b.xp / 6));
    const sum = Object.values(state.forge.branches).reduce((a, br) => a + br.xp, 0);
    state.forge.slots = Math.min(4, 1 + Math.floor(sum / 12));
  }
}

/** Progress toward next mine node level for UI. */
export function mineNodeProgress(state, resource) {
  const xp = state.mine?.usageXp?.[resource] || 0;
  const level = Math.min(10, 1 + Math.floor(xp / 8));
  const into = xp % 8;
  const maxed = level >= 10;
  return { level, xp, into: maxed ? 8 : into, need: 8, pct: maxed ? 1 : into / 8 };
}

export function forgeBranchProgress(state, branchId) {
  const b = state.forge?.branches?.[branchId] || { xp: 0, level: 1 };
  const into = (b.xp || 0) % 6;
  return { level: b.level || 1, xp: b.xp || 0, into, need: 6, pct: Math.min(1, into / 6) };
}

export function itemPowerScore(item) {
  if (!item) return 0;
  const rarity = { c: 0, u: 3, r: 7, e: 14 }[item.rarity] || 0;
  const stats = Object.values(item.stats || {}).reduce((a, v) => a + (Number(v) || 0), 0);
  return rarity + stats * 2.2 + (item.tier || 0) * 2;
}

/** Free stash + currently worn on this warrior for a slot. */
export function equipCandidates(state, warrior, slot) {
  const list = [];
  for (const id of state.inventory || []) {
    const it = state.items[id];
    if (!it || it.slot !== slot) continue;
    const onSelf = warrior.equip?.[slot] === id;
    const onOther = isItemEquipped(state, id) && !onSelf;
    if (onOther) continue;
    list.push(it);
  }
  return list;
}

export function bestItemForSlot(state, warrior, slot) {
  let best = null;
  let score = -1;
  for (const it of equipCandidates(state, warrior, slot)) {
    if (!canEquipHands(warrior, it, state.items) && warrior.equip?.[slot] !== it.id) {
      // try as if clearing offhand for 2H
      if (it.slot === 'weapon' && WEAPON_PROFILES[it.weaponType]?.hands === 2) {
        // allow if only offhand blocks
      } else continue;
    }
    const sc = itemPowerScore(it);
    if (sc > score) {
      score = sc;
      best = it;
    }
  }
  return best;
}

/** Equip item on warrior (clears conflicts). Returns { ok, err? }. */
export function equipOnWarrior(state, warrior, slot, itemId) {
  if (!warrior.equip) warrior.equip = {};
  if (!itemId) {
    warrior.equip[slot] = null;
    return { ok: true };
  }
  const item = state.items[itemId];
  if (!item || item.slot !== slot) return { ok: false, err: 'slot' };

  // strip from anyone (including self)
  for (const ow of state.warriors || []) {
    if (!ow.equip) continue;
    for (const sl of GEAR_SLOTS) {
      if (ow.equip[sl] === itemId) ow.equip[sl] = null;
    }
  }

  if (item.slot === 'weapon' && WEAPON_PROFILES[item.weaponType]?.hands === 2) {
    warrior.equip.offhand = null;
  }
  if (item.slot === 'offhand') {
    const w = warrior.equip.weapon && state.items[warrior.equip.weapon];
    if (w && WEAPON_PROFILES[w.weaponType]?.hands === 2) {
      warrior.equip.weapon = null;
    }
  }
  warrior.equip[slot] = itemId;
  return { ok: true };
}

/** Best available gear into every empty-or-weaker slot. */
export function autoEquipWarrior(state, warrior) {
  let changed = 0;
  for (const slot of GEAR_SLOTS) {
    const cur = warrior.equip?.[slot] ? state.items[warrior.equip[slot]] : null;
    const best = bestItemForSlot(state, warrior, slot);
    if (!best) continue;
    if (cur && itemPowerScore(cur) >= itemPowerScore(best)) continue;
    // 2H: free offhand first
    if (best.slot === 'weapon' && WEAPON_PROFILES[best.weaponType]?.hands === 2) {
      warrior.equip.offhand = null;
    }
    const res = equipOnWarrior(state, warrior, slot, best.id);
    if (res.ok) changed += 1;
  }
  return changed;
}

export function unequipAll(warrior) {
  if (!warrior?.equip) return;
  for (const sl of GEAR_SLOTS) warrior.equip[sl] = null;
}

export function itemSellValue(item) {
  const mult = { c: 1, u: 1.5, r: 3, e: 6 }[item.rarity] || 1;
  return Math.max(3, Math.round(8 * mult));
}

export function dismantleReturn(item) {
  const bp = BLUEPRINTS[item.blueprintId];
  if (!bp) return {};
  const out = {};
  const frac = { c: 0.35, u: 0.4, r: 0.5, e: 0.6 }[item.rarity] || 0.35;
  for (const [k, n] of Object.entries(bp.cost || {})) {
    out[k] = Math.max(1, Math.floor(n * frac));
  }
  return out;
}

export function barracksUpgradeCost(level) {
  const lv = Math.max(1, level | 0);
  return { gold: 80 + 90 * (lv - 1), iron_bar: lv >= 2 ? lv : 0 };
}

export function listResearchable(state) {
  return TECH_TREE.filter((t) => !state.research.unlocked.includes(t.blueprintId));
}

export function isItemEquipped(state, itemId) {
  return (state.warriors || []).some((w) => GEAR_SLOTS.some((sl) => w.equip?.[sl] === itemId));
}

export function equippedOwner(state, itemId) {
  for (const w of state.warriors || []) {
    for (const sl of GEAR_SLOTS) {
      if (w.equip?.[sl] === itemId) return w;
    }
  }
  return null;
}

export function freeInventoryIds(state) {
  return (state.inventory || []).filter((id) => !isItemEquipped(state, id));
}

export function warriorCombatant(warrior, itemsById, team, x, y) {
  const stats = effectiveStats(warrior, itemsById);
  const wType = primaryWeaponType(warrior, itemsById);
  const equip = warrior.equip || {};
  const get = (slot) => (equip[slot] ? itemsById?.[equip[slot]] : null);
  const weapon = get('weapon');
  const off = get('offhand');
  const helm = get('helm');
  const body = get('body');
  const legs = get('legs');
  const acc = get('accessory');
  const bpMetal = (it) => {
    const id = (it?.blueprintId || '').toLowerCase();
    if (id.includes('copper')) return 'copper';
    if (id.includes('wood') || id.includes('soft') || id.includes('ash')) return 'wood';
    if (id.includes('leather')) return 'leather';
    if (id.includes('iron') || id.includes('steel')) return 'iron';
    return 'iron';
  };
  return {
    id: warrior.id,
    name: warrior.name,
    team,
    x,
    y,
    hp: stats.hp,
    maxHp: stats.hp,
    sta: stats.sta,
    maxSta: stats.sta,
    stats,
    movePts: stats.move,
    weaponType: wType,
    masteryStars: wType === 'unarmed' ? 0 : warrior.mastery?.[wType]?.stars || 0,
    acted: false,
    moved: false,
    source: warrior,
    visual: {
      seed: warrior.portraitSeed || 1,
      weaponType: wType,
      weaponMetal: weapon ? bpMetal(weapon) : 'iron',
      weaponBp: weapon?.blueprintId || null,
      offhand: off ? (bpMetal(off) === 'wood' ? 'shield_wood' : 'shield_iron') : null,
      helm: helm ? (bpMetal(helm) === 'leather' ? 'leather' : 'metal') : 'none',
      body: body ? (bpMetal(body) === 'iron' ? 'iron' : 'leather') : 'cloth',
      legs: legs ? 'leather' : 'cloth',
      accessory: !!acc,
      team,
      kit: 'ally',
      unarmed: wType === 'unarmed',
    },
  };
}

export { FIRST_NAMES, LAST_NAMES };
