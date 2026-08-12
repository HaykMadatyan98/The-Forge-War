/** @typedef {'c'|'u'|'r'|'e'} Rarity */
/** @typedef {'sword'|'greatsword'|'axemace'|'spear'|'bow'|'crossbow'|'thrown'|'shield'} WeaponType */
/** @typedef {'metal'|'wood'|'leather'} LineId */
/** @typedef {'en'|'ru'} Lang */

export const MAP_W = 20;
export const MAP_H = 10;

export const RARITY = /** @type {const} */ (['c', 'u', 'r', 'e']);
export const RARITY_WEIGHTS_CRAFT_BASE = { c: 70, u: 22, r: 7, e: 1 };
export const RARITY_WEIGHTS_RECRUIT = { c: 55, u: 30, r: 12, e: 3 };

export const WEAPON_TYPES = /** @type {const} */ ([
  'sword',
  'greatsword',
  'axemace',
  'spear',
  'bow',
  'crossbow',
  'thrown',
  'shield',
]);

/** Resource catalog: 5 per specialty line + coal helper */
export const RESOURCES = {
  // metal
  copper_ore: { line: 'metal', tier: 1 },
  iron_ore: { line: 'metal', tier: 2 },
  coal: { line: 'metal', tier: 1 },
  steel_ore: { line: 'metal', tier: 3 },
  mythril_ore: { line: 'metal', tier: 4 },
  copper_bar: { line: 'metal', tier: 1, refined: true },
  iron_bar: { line: 'metal', tier: 2, refined: true },
  steel_bar: { line: 'metal', tier: 3, refined: true },
  mythril_bar: { line: 'metal', tier: 4, refined: true },
  // wood
  softwood: { line: 'wood', tier: 1 },
  hardwood: { line: 'wood', tier: 2 },
  ashwood: { line: 'wood', tier: 3 },
  ironwood: { line: 'wood', tier: 4 },
  yew: { line: 'wood', tier: 5 },
  softwood_plank: { line: 'wood', tier: 1, refined: true },
  hardwood_plank: { line: 'wood', tier: 2, refined: true },
  ash_plank: { line: 'wood', tier: 3, refined: true },
  ironwood_plank: { line: 'wood', tier: 4, refined: true },
  yew_plank: { line: 'wood', tier: 5, refined: true },
  // leather
  scrap_hide: { line: 'leather', tier: 1 },
  wolf_hide: { line: 'leather', tier: 2 },
  boar_hide: { line: 'leather', tier: 3 },
  bear_hide: { line: 'leather', tier: 4 },
  wyrm_scale: { line: 'leather', tier: 5 },
  scrap_leather: { line: 'leather', tier: 1, refined: true },
  wolf_leather: { line: 'leather', tier: 2, refined: true },
  boar_leather: { line: 'leather', tier: 3, refined: true },
  bear_leather: { line: 'leather', tier: 4, refined: true },
  wyrm_leather: { line: 'leather', tier: 5, refined: true },
};

export const MINEABLE = [
  'copper_ore',
  'iron_ore',
  'coal',
  'steel_ore',
  'mythril_ore',
  'softwood',
  'hardwood',
  'ashwood',
  'ironwood',
  'yew',
  'scrap_hide',
  'wolf_hide',
  'boar_hide',
  'bear_hide',
  'wyrm_scale',
];

/** @type {Record<string, {input: Record<string, number>, output: string, amount: number, seconds: number}>} */
export const SMELT_RECIPES = {
  copper_bar: { input: { copper_ore: 2 }, output: 'copper_bar', amount: 1, seconds: 20 },
  iron_bar: { input: { iron_ore: 2, coal: 1 }, output: 'iron_bar', amount: 1, seconds: 40 },
  steel_bar: { input: { iron_bar: 1, coal: 2 }, output: 'steel_bar', amount: 1, seconds: 60 },
  mythril_bar: { input: { mythril_ore: 2, coal: 2 }, output: 'mythril_bar', amount: 1, seconds: 120 },
  softwood_plank: { input: { softwood: 2 }, output: 'softwood_plank', amount: 1, seconds: 15 },
  hardwood_plank: { input: { hardwood: 2 }, output: 'hardwood_plank', amount: 1, seconds: 30 },
  ash_plank: { input: { ashwood: 2 }, output: 'ash_plank', amount: 1, seconds: 45 },
  ironwood_plank: { input: { ironwood: 2 }, output: 'ironwood_plank', amount: 1, seconds: 70 },
  yew_plank: { input: { yew: 2 }, output: 'yew_plank', amount: 1, seconds: 90 },
  scrap_leather: { input: { scrap_hide: 2 }, output: 'scrap_leather', amount: 1, seconds: 15 },
  wolf_leather: { input: { wolf_hide: 2 }, output: 'wolf_leather', amount: 1, seconds: 30 },
  boar_leather: { input: { boar_hide: 2 }, output: 'boar_leather', amount: 1, seconds: 45 },
  bear_leather: { input: { bear_hide: 2 }, output: 'bear_leather', amount: 1, seconds: 70 },
  wyrm_leather: { input: { wyrm_scale: 2 }, output: 'wyrm_leather', amount: 1, seconds: 100 },
};

/**
 * Weapon archetype combat profile
 * hands: 1 | 2
 * range min-max in tiles (orthogonal+diagonal chebyshev-ish via range check)
 */
export const WEAPON_PROFILES = {
  sword: { hands: 1, rangeMin: 1, rangeMax: 1, power: 1, acc: 1, init: 0, sta: 8 },
  greatsword: { hands: 2, rangeMin: 1, rangeMax: 1, power: 1.35, acc: 0.92, init: -2, sta: 12 },
  axemace: { hands: 1, rangeMin: 1, rangeMax: 1, power: 1.2, acc: 0.95, init: -1, sta: 10 },
  spear: { hands: 1, rangeMin: 1, rangeMax: 2, power: 1.05, acc: 1, init: 0, sta: 9 },
  bow: { hands: 2, rangeMin: 2, rangeMax: 6, power: 1, acc: 0.98, init: 1, sta: 8 },
  crossbow: { hands: 2, rangeMin: 2, rangeMax: 5, power: 1.25, acc: 1.05, init: -1, sta: 11 },
  thrown: { hands: 1, rangeMin: 1, rangeMax: 3, power: 0.9, acc: 0.95, init: 2, sta: 7 },
  shield: { hands: 1, rangeMin: 1, rangeMax: 1, power: 0.55, acc: 0.9, init: -1, sta: 6, block: 1.4 },
};

/** Equip slots */
export const GEAR_SLOTS = ['weapon', 'offhand', 'helm', 'body', 'legs', 'accessory'];

/**
 * Blueprint catalog (MVP set)
 * branch: melee | pole | ranged | armor
 */
export const BLUEPRINTS = {
  bp_copper_sword: {
    id: 'bp_copper_sword',
    slot: 'weapon',
    weaponType: 'sword',
    branch: 'melee',
    tier: 1,
    unlock: true,
    craftSeconds: 45,
    cost: { copper_bar: 3, scrap_leather: 1 },
    base: { atk: 8, acc: 4 },
  },
  bp_iron_sword: {
    id: 'bp_iron_sword',
    slot: 'weapon',
    weaponType: 'sword',
    branch: 'melee',
    tier: 2,
    researchGold: 80,
    researchSeconds: 90,
    craftSeconds: 70,
    cost: { iron_bar: 3, wolf_leather: 1 },
    base: { atk: 14, acc: 6 },
  },
  bp_copper_greatsword: {
    id: 'bp_copper_greatsword',
    slot: 'weapon',
    weaponType: 'greatsword',
    branch: 'melee',
    tier: 1,
    unlock: true,
    craftSeconds: 55,
    cost: { copper_bar: 5 },
    base: { atk: 12, acc: 2 },
  },
  bp_iron_axe: {
    id: 'bp_iron_axe',
    slot: 'weapon',
    weaponType: 'axemace',
    branch: 'melee',
    tier: 2,
    researchGold: 70,
    researchSeconds: 80,
    craftSeconds: 65,
    cost: { iron_bar: 3, hardwood_plank: 1 },
    base: { atk: 15, acc: 3 },
  },
  bp_ash_spear: {
    id: 'bp_ash_spear',
    slot: 'weapon',
    weaponType: 'spear',
    branch: 'pole',
    tier: 1,
    unlock: true,
    craftSeconds: 50,
    cost: { softwood_plank: 3, copper_bar: 1 },
    base: { atk: 9, acc: 5 },
  },
  bp_soft_bow: {
    id: 'bp_soft_bow',
    slot: 'weapon',
    weaponType: 'bow',
    branch: 'ranged',
    tier: 1,
    unlock: true,
    craftSeconds: 50,
    cost: { softwood_plank: 3, scrap_leather: 1 },
    base: { atk: 9, acc: 6 },
  },
  bp_yew_bow: {
    id: 'bp_yew_bow',
    slot: 'weapon',
    weaponType: 'bow',
    branch: 'ranged',
    tier: 3,
    researchGold: 200,
    researchSeconds: 180,
    craftSeconds: 100,
    cost: { yew_plank: 3, bear_leather: 1 },
    base: { atk: 20, acc: 10 },
  },
  bp_wood_crossbow: {
    id: 'bp_wood_crossbow',
    slot: 'weapon',
    weaponType: 'crossbow',
    branch: 'ranged',
    tier: 2,
    researchGold: 100,
    researchSeconds: 100,
    craftSeconds: 75,
    cost: { hardwood_plank: 3, iron_bar: 1 },
    base: { atk: 16, acc: 8 },
  },
  bp_throwing_knife: {
    id: 'bp_throwing_knife',
    slot: 'weapon',
    weaponType: 'thrown',
    branch: 'ranged',
    tier: 1,
    unlock: true,
    craftSeconds: 35,
    cost: { copper_bar: 2 },
    base: { atk: 7, acc: 5 },
  },
  bp_wood_shield: {
    id: 'bp_wood_shield',
    slot: 'offhand',
    weaponType: 'shield',
    branch: 'armor',
    tier: 1,
    unlock: true,
    craftSeconds: 40,
    cost: { softwood_plank: 3 },
    base: { def: 6, block: 4 },
  },
  bp_iron_shield: {
    id: 'bp_iron_shield',
    slot: 'offhand',
    weaponType: 'shield',
    branch: 'armor',
    tier: 2,
    researchGold: 90,
    researchSeconds: 90,
    craftSeconds: 70,
    cost: { iron_bar: 3, wolf_leather: 1 },
    base: { def: 12, block: 8 },
  },
  bp_leather_helm: {
    id: 'bp_leather_helm',
    slot: 'helm',
    branch: 'armor',
    tier: 1,
    unlock: true,
    craftSeconds: 30,
    cost: { scrap_leather: 3 },
    base: { def: 3, hp: 4 },
  },
  bp_leather_body: {
    id: 'bp_leather_body',
    slot: 'body',
    branch: 'armor',
    tier: 1,
    unlock: true,
    craftSeconds: 45,
    cost: { scrap_leather: 5 },
    base: { def: 6, hp: 8 },
  },
  bp_leather_legs: {
    id: 'bp_leather_legs',
    slot: 'legs',
    branch: 'armor',
    tier: 1,
    unlock: true,
    craftSeconds: 35,
    cost: { scrap_leather: 4 },
    base: { def: 4, hp: 5 },
  },
  bp_iron_body: {
    id: 'bp_iron_body',
    slot: 'body',
    branch: 'armor',
    tier: 2,
    researchGold: 120,
    researchSeconds: 110,
    craftSeconds: 90,
    cost: { iron_bar: 4, wolf_leather: 2 },
    base: { def: 14, hp: 12 },
  },
  bp_copper_ring: {
    id: 'bp_copper_ring',
    slot: 'accessory',
    branch: 'armor',
    tier: 1,
    unlock: true,
    craftSeconds: 25,
    cost: { copper_bar: 2 },
    base: { acc: 3, crit: 2 },
  },
};

export const TECH_TREE = Object.values(BLUEPRINTS)
  .filter((bp) => !bp.unlock)
  .map((bp) => ({
    id: `tech_${bp.id}`,
    blueprintId: bp.id,
    gold: bp.researchGold || 50,
    seconds: bp.researchSeconds || 60,
  }));

export const REGIONS = [
  {
    id: 'fields',
    order: 1,
    missions: [
      { id: 'fields_1', enemies: 2, enemyLvl: 1, reward: { gold: 40, copper_ore: 6, softwood: 4 }, difficulty: 'normal' },
      { id: 'fields_2', enemies: 3, enemyLvl: 2, reward: { gold: 55, scrap_hide: 5, copper_ore: 4 }, difficulty: 'normal' },
      { id: 'fields_3', enemies: 4, enemyLvl: 3, reward: { gold: 70, iron_ore: 4, hardwood: 3 }, difficulty: 'normal' },
      { id: 'fields_boss', enemies: 5, enemyLvl: 4, boss: true, reward: { gold: 120, iron_ore: 8, wolf_hide: 4 }, difficulty: 'normal' },
    ],
  },
  {
    id: 'forest',
    order: 2,
    unlockAfter: 'fields_boss',
    missions: [
      { id: 'forest_1', enemies: 4, enemyLvl: 5, reward: { gold: 90, hardwood: 6, ashwood: 2 }, difficulty: 'normal' },
      { id: 'forest_2', enemies: 5, enemyLvl: 6, reward: { gold: 100, wolf_hide: 5, iron_ore: 5 }, difficulty: 'normal' },
      { id: 'forest_3', enemies: 6, enemyLvl: 7, reward: { gold: 120, boar_hide: 4, coal: 6 }, difficulty: 'normal' },
      { id: 'forest_boss', enemies: 7, enemyLvl: 8, boss: true, reward: { gold: 180, ashwood: 6, iron_bar: 2 }, difficulty: 'normal' },
    ],
  },
  {
    id: 'hills',
    order: 3,
    unlockAfter: 'forest_boss',
    missions: [
      { id: 'hills_1', enemies: 6, enemyLvl: 9, reward: { gold: 140, steel_ore: 3, ironwood: 3 }, difficulty: 'normal' },
      { id: 'hills_2', enemies: 7, enemyLvl: 10, reward: { gold: 160, bear_hide: 3, coal: 8 }, difficulty: 'normal' },
      { id: 'hills_3', enemies: 8, enemyLvl: 11, reward: { gold: 180, mythril_ore: 2, yew: 2 }, difficulty: 'normal' },
      { id: 'hills_boss', enemies: 10, enemyLvl: 12, boss: true, reward: { gold: 280, mythril_ore: 4, wyrm_scale: 2 }, difficulty: 'normal' },
    ],
  },
];

export const DIFFICULTY_MULT = {
  normal: { enemy: 1, reward: 1 },
  hard: { enemy: 1.25, reward: 1.5 },
  brutal: { enemy: 1.55, reward: 2 },
};

export const BARRACKS_DEPLOY = [2, 4, 6, 8, 10];
export const BARRACKS_ROSTER = [8, 12, 16, 22, 30];
export const INVENTORY_BASE = 30;
export const INVENTORY_MAX = 80;

export const STAT_CAP = 30;
export const LEVEL_CAP = 30;
export const MASTERY_CAP = 10;

/** XP to next mastery star (index = current stars) */
export function masteryXpToNext(stars) {
  return 20 + stars * 25;
}

export function levelXpToNext(level) {
  return Math.floor(40 + level * level * 8);
}

export const STARTER_RESOURCE = {
  gold: 120,
  sparks: 0,
  copper_ore: 12,
  softwood: 10,
  scrap_hide: 10,
  coal: 4,
};

export const SAVE_KEY = 'tfw_campaign_v1';
