/** Static generated art maps (files in /public/art) */

/** Mine & smelt resources (`/art/resources/{id}.png`) */
export const RESOURCE_ART: Record<string, string> = {
  copper_ore: '/art/resources/copper_ore.png',
  iron_ore: '/art/resources/iron_ore.png',
  coal: '/art/resources/coal.png',
  steel_ore: '/art/resources/steel_ore.png',
  mythril_ore: '/art/resources/mythril_ore.png',
  copper_bar: '/art/resources/copper_bar.png',
  iron_bar: '/art/resources/iron_bar.png',
  steel_bar: '/art/resources/steel_bar.png',
  mythril_bar: '/art/resources/mythril_bar.png',
  softwood: '/art/resources/softwood.png',
  hardwood: '/art/resources/hardwood.png',
  ashwood: '/art/resources/ashwood.png',
  ironwood: '/art/resources/ironwood.png',
  yew: '/art/resources/yew.png',
  softwood_plank: '/art/resources/softwood_plank.png',
  hardwood_plank: '/art/resources/hardwood_plank.png',
  ash_plank: '/art/resources/ash_plank.png',
  ironwood_plank: '/art/resources/ironwood_plank.png',
  yew_plank: '/art/resources/yew_plank.png',
  scrap_hide: '/art/resources/scrap_hide.png',
  wolf_hide: '/art/resources/wolf_hide.png',
  boar_hide: '/art/resources/boar_hide.png',
  bear_hide: '/art/resources/bear_hide.png',
  wyrm_scale: '/art/resources/wyrm_scale.png',
  scrap_leather: '/art/resources/scrap_leather.png',
  wolf_leather: '/art/resources/wolf_leather.png',
  boar_leather: '/art/resources/boar_leather.png',
  bear_leather: '/art/resources/bear_leather.png',
  wyrm_leather: '/art/resources/wyrm_leather.png',
};

export function resourceImageSrc(id?: string | null): string | null {
  if (!id) return null;
  return RESOURCE_ART[id] || null;
}

export const WEAPON_ART: Record<string, string> = {
  sword: '/art/weapons/sword_iron.png',
  greatsword: '/art/weapons/greatsword.png',
  axemace: '/art/weapons/axe.png',
  spear: '/art/weapons/spear.png',
  bow: '/art/weapons/bow.png',
  crossbow: '/art/weapons/crossbow.png',
  thrown: '/art/weapons/thrown.png',
  shield: '/art/weapons/shield_wood.png',
};

export const BLUEPRINT_ART: Record<string, string> = {
  bp_copper_sword: '/art/weapons/sword_copper.png',
  bp_iron_sword: '/art/weapons/sword_iron.png',
  bp_copper_greatsword: '/art/weapons/greatsword.png',
  bp_iron_axe: '/art/weapons/axe.png',
  bp_ash_spear: '/art/weapons/spear.png',
  bp_soft_bow: '/art/weapons/bow.png',
  bp_yew_bow: '/art/weapons/bow_yew.png',
  bp_wood_crossbow: '/art/weapons/crossbow.png',
  bp_throwing_knife: '/art/weapons/thrown.png',
  bp_wood_shield: '/art/weapons/shield_wood.png',
  bp_iron_shield: '/art/weapons/shield_iron.png',
  bp_leather_helm: '/art/armor/helm_leather.png',
  bp_leather_body: '/art/armor/body_leather.png',
  bp_leather_legs: '/art/armor/legs_leather.png',
  bp_iron_body: '/art/armor/body_iron.png',
  bp_copper_ring: '/art/armor/ring_copper.png',
};

export const SLOT_ART: Record<string, string> = {
  weapon: '/art/weapons/sword_iron.png',
  offhand: '/art/weapons/shield_wood.png',
  helm: '/art/armor/helm_leather.png',
  body: '/art/armor/body_leather.png',
  legs: '/art/armor/legs_leather.png',
  accessory: '/art/armor/ring_copper.png',
};

export const WARRIOR_ART = {
  sword: '/art/warriors/warrior_sword.png',
  bow: '/art/warriors/warrior_bow.png',
  spear: '/art/warriors/warrior_spear.png',
  iron: '/art/warriors/warrior_iron.png',
  axe: '/art/warriors/warrior_axe.png',
} as const;

/** Per-identity weapon×armor sheets: `/art/warriors/w{0-4}/{weapon}_{armor}.png` */
const WARRIOR_WEAPONS = [
  'sword',
  'greatsword',
  'axe',
  'spear',
  'bow',
  'crossbow',
  'thrown',
] as const;

const WARRIOR_ARMORS = ['leather', 'iron'] as const;

/** Known exception / extra files beyond the base 7×2 matrix. */
const WARRIOR_EXTRA: Record<number, string[]> = {
  0: ['sword_cloth', 'sword_leather_shield'],
};

function warriorVariantPath(id: number, key: string): string {
  return `/art/warriors/w${id}/${key}.png`;
}

function hasWarriorVariant(id: number, key: string): boolean {
  const [weapon, armor, extra] = key.split('_');
  if (extra) return (WARRIOR_EXTRA[id] || []).includes(key);
  if ((WARRIOR_EXTRA[id] || []).includes(key)) return true;
  if (armor === 'cloth') return (WARRIOR_EXTRA[id] || []).includes(key);
  if (!(WARRIOR_ARMORS as readonly string[]).includes(armor)) return false;
  if (!(WARRIOR_WEAPONS as readonly string[]).includes(weapon)) return false;
  return true;
}

function weaponArtKey(weaponType?: string): string {
  const wt = weaponType || 'sword';
  if (wt === 'axemace') return 'axe';
  if (wt === 'shield') return 'sword';
  if ((WARRIOR_WEAPONS as readonly string[]).includes(wt)) return wt;
  return 'sword';
}

function armorArtKey(body?: string, helm?: string): 'iron' | 'leather' | 'cloth' {
  if (body === 'iron' || helm === 'metal') return 'iron';
  if (body === 'cloth') return 'cloth';
  return 'leather';
}

export const PORTRAIT_ART = [
  '/art/portraits/port_0.png',
  '/art/portraits/port_1.png',
  '/art/portraits/port_2.png',
  '/art/portraits/port_3.png',
];

/** Clos-up faces matching warrior identities w0–w4 (seed % 5). */
export const FACE_ART = [
  '/art/portraits/face_w0.png',
  '/art/portraits/face_w1.png',
  '/art/portraits/face_w2.png',
  '/art/portraits/face_w3.png',
  '/art/portraits/face_w4.png',
];

export function gearImageSrc(opts: {
  blueprintId?: string | null;
  weaponType?: string;
  slot?: string;
}): string | null {
  const bp = opts.blueprintId || '';
  if (bp && BLUEPRINT_ART[bp]) return BLUEPRINT_ART[bp];
  if (opts.weaponType && WEAPON_ART[opts.weaponType]) return WEAPON_ART[opts.weaponType];
  // infer from type_* fake ids
  if (bp.startsWith('type_')) {
    const t = bp.slice(5);
    if (WEAPON_ART[t]) return WEAPON_ART[t];
  }
  if (opts.slot && SLOT_ART[opts.slot]) return SLOT_ART[opts.slot];
  if (bp && SLOT_ART[bp]) return SLOT_ART[bp];
  return null;
}

/** Full-body painted warrior: same face via seed→w0..w4, gear via weapon×armor. */
export function warriorImageSrc(loadout: {
  seed?: number;
  weaponType?: string;
  body?: string;
  helm?: string;
  offhand?: string | null;
}): string {
  const id = Math.abs((loadout.seed ?? 0) | 0) % 5;
  const weapon = weaponArtKey(loadout.weaponType);
  const armor = armorArtKey(loadout.body, loadout.helm);
  const candidates: string[] = [];

  if (loadout.offhand && armor === 'leather' && weapon === 'sword') {
    candidates.push(`sword_leather_shield`);
  }
  candidates.push(`${weapon}_${armor}`);
  if (armor === 'cloth') candidates.push(`${weapon}_leather`, `sword_cloth`);
  candidates.push(`sword_${armor}`, `${weapon}_leather`, `sword_leather`);

  for (const key of candidates) {
    if (hasWarriorVariant(id, key)) return warriorVariantPath(id, key);
  }

  // Legacy generic fallbacks
  if (armor === 'iron') return WARRIOR_ART.iron;
  if (weapon === 'bow' || weapon === 'crossbow' || weapon === 'thrown') return WARRIOR_ART.bow;
  if (weapon === 'spear') return WARRIOR_ART.spear;
  if (weapon === 'axe' || weapon === 'greatsword') return WARRIOR_ART.axe;
  return WARRIOR_ART.sword;
}

/** Headshot face matching warrior identity (barracks cards). */
export function faceImageSrc(seed = 0): string {
  return FACE_ART[Math.abs(seed | 0) % FACE_ART.length];
}

export function portraitImageSrc(seed = 0): string {
  return faceImageSrc(seed);
}
