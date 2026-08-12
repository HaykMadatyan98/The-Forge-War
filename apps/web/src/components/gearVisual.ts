/** Visual material / silhouette keys derived from blueprint + item */

export type MetalHue = 'copper' | 'iron' | 'steel' | 'wood' | 'gold' | 'leather';

export type VisualLoadout = {
  seed: number;
  name?: string;
  weaponType: string;
  weaponMetal: MetalHue;
  weaponBp?: string | null;
  offhand: 'shield_wood' | 'shield_iron' | null;
  helm: 'none' | 'leather' | 'metal';
  body: 'cloth' | 'leather' | 'iron';
  legs: 'cloth' | 'leather';
  accessory: boolean;
  team?: 'player' | 'enemy';
  boss?: boolean;
};

const METALS: Record<MetalHue, { light: string; mid: string; dark: string }> = {
  copper: { light: '#e0a070', mid: '#b86a3a', dark: '#7a3a18' },
  iron: { light: '#c8ccd2', mid: '#8a9098', dark: '#4a4e56' },
  steel: { light: '#e8eef4', mid: '#a8b0ba', dark: '#5a626c' },
  wood: { light: '#c49058', mid: '#8a5a2e', dark: '#4a3018' },
  gold: { light: '#f0d878', mid: '#c8a040', dark: '#7a5810' },
  leather: { light: '#c49868', mid: '#8a5a36', dark: '#4a2e18' },
};

export function metalPalette(m: MetalHue) {
  return METALS[m] || METALS.iron;
}

export function metalFromId(id = ''): MetalHue {
  const s = id.toLowerCase();
  if (s.includes('copper')) return 'copper';
  if (s.includes('mythril') || s.includes('steel') || s.includes('yew')) return 'steel';
  if (s.includes('iron')) return 'iron';
  if (s.includes('wood') || s.includes('ash') || s.includes('soft') || s.includes('hard') || s.includes('plank'))
    return 'wood';
  if (s.includes('leather') || s.includes('hide') || s.includes('scale')) return 'leather';
  if (s.includes('ring') || s.includes('gold')) return 'gold';
  return 'iron';
}

/** Resolve painted loadout from warrior + items map (or combat unit). */
export function resolveLoadout(source: any, itemsById?: Record<string, any>): VisualLoadout {
  if (!source) {
    return {
      seed: 1,
      weaponType: 'unarmed',
      weaponMetal: 'iron',
      offhand: null,
      helm: 'none',
      body: 'cloth',
      legs: 'cloth',
      accessory: false,
    };
  }
  // Combat unit already flattened
  if (source.visual) return { ...source.visual, seed: source.visual.seed ?? source.portraitSeed ?? 1 };

  const items = itemsById || {};
  const equip = source.equip || {};
  const get = (slot: string) => (equip[slot] ? items[equip[slot]] : null);

  const weapon = get('weapon');
  const off = get('offhand');
  const helm = get('helm');
  const body = get('body');
  const legs = get('legs');
  const acc = get('accessory');

  let weaponType = weapon?.weaponType || 'unarmed';
  if (!weapon && off?.weaponType === 'shield') weaponType = 'shield';

  let offhand: VisualLoadout['offhand'] = null;
  if (off?.weaponType === 'shield' || off?.slot === 'offhand') {
    offhand = metalFromId(off.blueprintId || off.id || '') === 'wood' ? 'shield_wood' : 'shield_iron';
  }

  let helmV: VisualLoadout['helm'] = 'none';
  if (helm) helmV = metalFromId(helm.blueprintId || '') === 'leather' || (helm.blueprintId || '').includes('leather')
    ? 'leather'
    : 'metal';

  let bodyV: VisualLoadout['body'] = 'cloth';
  if (body) {
    const id = body.blueprintId || '';
    bodyV = id.includes('iron') || metalFromId(id) === 'iron' || metalFromId(id) === 'steel' ? 'iron' : 'leather';
  }

  let legsV: VisualLoadout['legs'] = 'cloth';
  if (legs) legsV = 'leather';

  return {
    seed: source.portraitSeed || source.seed || 1,
    name: source.name,
    weaponType: source.weaponType || weaponType,
    weaponMetal: metalFromId(weapon?.blueprintId || weapon?.id || ''),
    weaponBp: weapon?.blueprintId || null,
    offhand,
    helm: helmV,
    body: bodyV,
    legs: legsV,
    accessory: !!acc,
    team: source.team,
    boss: !!source.isBoss,
  };
}

export function skinTone(seed: number) {
  const tones = [
    { light: '#f0d0b0', mid: '#e0b898', dark: '#b88868', deep: '#8a6048' },
    { light: '#e8c098', mid: '#c49870', dark: '#9a7050', deep: '#6a4830' },
    { light: '#f2d8b8', mid: '#d4a888', dark: '#b07a58', deep: '#7a5038' },
    { light: '#d4a888', mid: '#b88868', dark: '#8a6048', deep: '#5a3a28' },
    { light: '#c89870', mid: '#a87858', dark: '#7a5038', deep: '#4a3018' },
    { light: '#e8c8a0', mid: '#c8a078', dark: '#9a7858', deep: '#6a4a30' },
  ];
  return tones[Math.abs(seed | 0) % tones.length];
}

export function skinMid(seed: number) {
  return skinTone(seed).mid;
}

export function clothColor(seed: number) {
  const c = [
    { light: '#6a7a8a', mid: '#4a5a6a', dark: '#2a3a4a' },
    { light: '#7a6a58', mid: '#5a4a38', dark: '#3a2a1c' },
    { light: '#5a6a5a', mid: '#3a4a3a', dark: '#1a2a1a' },
    { light: '#6a4a5a', mid: '#4a3848', dark: '#2a1830' },
    { light: '#7a5a40', mid: '#5a3a28', dark: '#3a1a10' },
    { light: '#5a5a6a', mid: '#3a3a48', dark: '#1a1a28' },
  ];
  return c[Math.abs((seed | 0) * 3) % c.length];
}

export function hairColor(seed: number) {
  const h = [
    { light: '#5a3a22', mid: '#3a2414', dark: '#1a1008' },
    { light: '#8a6a40', mid: '#6a4a28', dark: '#3a2810' },
    { light: '#2a2a2e', mid: '#16161a', dark: '#08080a' },
    { light: '#a07848', mid: '#7a5430', dark: '#4a3018' },
    { light: '#6a4030', mid: '#4a2818', dark: '#2a1008' },
    { light: '#c8b090', mid: '#a89070', dark: '#6a5840' },
  ];
  return h[Math.abs((seed | 0) * 7) % h.length];
}

export function eyeColor(seed: number) {
  const e = ['#3a4a2a', '#2a3a5a', '#4a3a28', '#2a4a4a', '#3a2a28', '#2a2a3a'];
  return e[Math.abs((seed | 0) * 11) % e.length];
}
