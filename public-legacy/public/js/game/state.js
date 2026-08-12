import {
  BARRACKS_DEPLOY,
  BARRACKS_ROSTER,
  BLUEPRINTS,
  GEAR_SLOTS,
  INVENTORY_BASE,
  RARITY_WEIGHTS_CRAFT_BASE,
  RARITY_WEIGHTS_RECRUIT,
  STARTER_RESOURCE,
  TECH_TREE,
  WEAPON_PROFILES,
  WEAPON_TYPES,
  STAT_CAP,
} from '../data/catalog.js';

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

const NAME_POOL = {
  en: ['Ash', 'Bren', 'Cora', 'Dunn', 'Edda', 'Flint', 'Grit', 'Hale', 'Ivor', 'Joss', 'Kara', 'Lute', 'Mira', 'Noll', 'Orin', 'Pike', 'Quinn', 'Rook', 'Sera', 'Tor'],
  ru: ['Яр', 'Бор', 'Вера', 'Глеб', 'Дана', 'Егор', 'Ждан', 'Зоя', 'Илья', 'Кира', 'Лев', 'Мира', 'Олег', 'Поля', 'Ром', 'Сева', 'Тима', 'Уля', 'Федя', 'Хома'],
};

const TEMPLATES = [
  { id: 'brawler', atk: 6, def: 4, hp: 28, spd: 8, acc: 8, eva: 4, crit: 4, blk: 2, sta: 30, move: 4, atkGrow: 1, defGrow: 0, masteryBias: 'axemace' },
  { id: 'guard', atk: 4, def: 7, hp: 34, spd: 5, acc: 6, eva: 3, crit: 2, blk: 6, sta: 32, move: 3, atkGrow: 0, defGrow: 1, masteryBias: 'shield' },
  { id: 'skirmisher', atk: 5, def: 3, hp: 24, spd: 12, acc: 9, eva: 8, crit: 6, blk: 1, sta: 28, move: 5, atkGrow: 1, defGrow: 0, masteryBias: 'thrown' },
  { id: 'archer', atk: 5, def: 3, hp: 22, spd: 10, acc: 11, eva: 6, crit: 7, blk: 1, sta: 26, move: 4, atkGrow: 1, defGrow: 0, masteryBias: 'bow' },
  { id: 'spearline', atk: 5, def: 5, hp: 28, spd: 7, acc: 9, eva: 4, crit: 3, blk: 3, sta: 30, move: 4, atkGrow: 1, defGrow: 0, masteryBias: 'spear' },
  { id: 'reaver', atk: 7, def: 3, hp: 26, spd: 9, acc: 7, eva: 5, crit: 8, blk: 1, sta: 28, move: 4, atkGrow: 1, defGrow: 0, masteryBias: 'greatsword' },
];

export function createWarrior(opts = {}) {
  const lang = opts.lang || 'en';
  const rarity = opts.rarity || weightedPick(RARITY_WEIGHTS_RECRUIT, opts.rng || Math.random);
  const tpl = opts.template || TEMPLATES[Math.floor((opts.rng || Math.random)() * TEMPLATES.length)];
  const rarMult = { c: 1, u: 1.08, r: 1.18, e: 1.32 }[rarity];
  const names = NAME_POOL[lang] || NAME_POOL.en;
  const name = opts.name || names[Math.floor((opts.rng || Math.random)() * names.length)];

  const base = {
    hp: Math.round(tpl.hp * rarMult),
    atk: Math.round(tpl.atk * rarMult),
    def: Math.round(tpl.def * rarMult),
    spd: Math.round(tpl.spd * rarMult),
    acc: Math.round(tpl.acc * rarMult),
    eva: Math.round(tpl.eva * rarMult),
    crit: Math.round(tpl.crit * rarMult),
    blk: Math.round(tpl.blk * rarMult),
    sta: Math.round(tpl.sta * rarMult),
    move: tpl.move,
  };

  const mastery = {};
  for (const wt of WEAPON_TYPES) mastery[wt] = { stars: 0, xp: 0 };
  mastery[tpl.masteryBias] = { stars: rarity === 'e' ? 2 : rarity === 'r' ? 1 : 0, xp: 0 };

  return {
    id: uid('w'),
    name,
    rarity,
    template: { id: tpl.id, atkGrow: tpl.atkGrow, defGrow: tpl.defGrow },
    level: 1,
    xp: 0,
    freePoints: 0,
    base,
    points: { hp: 0, atk: 0, def: 0, spd: 0, acc: 0, eva: 0, crit: 0, blk: 0, sta: 0 },
    mastery,
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

export function primaryWeaponType(warrior, itemsById) {
  const w = warrior.equip.weapon && itemsById[warrior.equip.weapon];
  if (w?.weaponType) return w.weaponType;
  const oh = warrior.equip.offhand && itemsById[warrior.equip.offhand];
  if (oh?.weaponType === 'shield' && !w) return 'shield';
  return 'sword';
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
    template: TEMPLATES[0],
    name: lang === 'ru' ? 'Бренн' : 'Brenn',
  });
  const w2 = createWarrior({
    lang,
    rarity: 'u',
    template: TEMPLATES[3],
    name: lang === 'ru' ? 'Сира' : 'Sera',
  });
  w1.mastery.sword.stars = 1;
  w2.mastery.bow.stars = 1;

  const items = {};
  const sword = createItemFromBlueprint('bp_copper_sword', 1, () => 0.1);
  const bow = createItemFromBlueprint('bp_soft_bow', 1, () => 0.1);
  const body1 = createItemFromBlueprint('bp_leather_body', 1, () => 0.2);
  const body2 = createItemFromBlueprint('bp_leather_body', 1, () => 0.3);
  for (const it of [sword, bow, body1, body2]) items[it.id] = it;
  w1.equip.weapon = sword.id;
  w1.equip.body = body1.id;
  w2.equip.weapon = bow.id;
  w2.equip.body = body2.id;

  const unlockedBlueprints = Object.values(BLUEPRINTS)
    .filter((b) => b.unlock)
    .map((b) => b.id);

  return {
    version: 1,
    lang,
    gold: res.gold,
    sparks: res.sparks,
    resources: Object.fromEntries(
      Object.keys(res)
        .filter((k) => k !== 'gold' && k !== 'sparks')
        .map((k) => [k, res[k]]),
    ),
    inventory: Object.keys(items),
    items,
    warriors: [w1, w2],
    barracksLevel: 1,
    mine: {
      slots: 1,
      usageXp: {},
      levels: {},
      jobs: [], // {slot, type:'mine'|'smelt', key, endsAt, payload}
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
      queue: null, // {techId, endsAt}
    },
    campaign: {
      cleared: {}, // missionId -> best difficulty cleared
      unlockedRegions: ['fields'],
    },
    flags: { tutorialSeen: false },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
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
    state.mine.slots = Math.min(4, 1 + Math.floor(total / 20));
  } else if (scope === 'forge') {
    const b = state.forge.branches[key];
    if (!b) return;
    b.xp += amount;
    b.level = Math.min(10, 1 + Math.floor(b.xp / 6));
    const sum = Object.values(state.forge.branches).reduce((a, br) => a + br.xp, 0);
    state.forge.slots = Math.min(4, 1 + Math.floor(sum / 15));
  }
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
  return { gold: 100 * level, iron_bar: level >= 2 ? level : 0 };
}

export function listResearchable(state) {
  return TECH_TREE.filter((t) => !state.research.unlocked.includes(t.blueprintId));
}

export function warriorCombatant(warrior, itemsById, team, x, y) {
  const stats = effectiveStats(warrior, itemsById);
  const wType = primaryWeaponType(warrior, itemsById);
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
    masteryStars: warrior.mastery[wType]?.stars || 0,
    acted: false,
    moved: false,
    source: warrior,
  };
}

export { TEMPLATES, NAME_POOL };
