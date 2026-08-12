/** Build a defense squad from authenticated cloud save only (no client-authored stats). */

const BARRACKS_DEPLOY = [2, 4, 6, 8, 10];

const UNIT_STAT_KEYS = [
  'hp',
  'atk',
  'def',
  'spd',
  'acc',
  'eva',
  'crit',
  'blk',
  'sta',
  'move',
] as const;

const STAT_CAPS: Record<string, number> = {
  hp: 400,
  atk: 80,
  def: 80,
  spd: 30,
  acc: 40,
  eva: 30,
  crit: 40,
  blk: 40,
  sta: 80,
  move: 10,
};

function clampInt(n: unknown, min: number, max: number, fallback: number) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

function sanitizeStats(src: any, fallback: Record<string, number>) {
  const out: Record<string, number> = { ...fallback };
  if (!src || typeof src !== 'object') return out;
  for (const k of UNIT_STAT_KEYS) {
    out[k] = clampInt(src[k], 0, STAT_CAPS[k] ?? 999, fallback[k] ?? 0);
  }
  return out;
}

function deployCap(barracksLevel: number) {
  const lvl = clampInt(barracksLevel, 1, BARRACKS_DEPLOY.length, 1);
  return BARRACKS_DEPLOY[lvl - 1];
}

function estimatePower(warriors: any[], items: Record<string, any>) {
  let p = 0;
  for (const w of warriors) {
    const base = w.base || {};
    const pts = w.points || {};
    const hp = (base.hp || 0) + (pts.hp || 0) * 4;
    const atk = (base.atk || 0) + (pts.atk || 0);
    const def = (base.def || 0) + (pts.def || 0);
    p += hp + atk * 4 + def * 3 + (w.level || 1) * 12;
    const eq = w.equip || {};
    for (const slot of Object.keys(eq)) {
      const id = eq[slot];
      if (id && items[id]) p += 12 + Math.min(40, Number(items[id].tier || 1) * 6);
    }
  }
  return Math.max(1, Math.round(p));
}

/**
 * Extract roster + equipped items from save, with hard caps so malicious saves
 * cannot store infinite stats on the defense board.
 */
export function squadFromCloudSave(save: any): {
  warriors: any[];
  items: Record<string, any>;
  power: number;
  barracksLevel: number;
} | null {
  if (!save || typeof save !== 'object') return null;
  const all = Array.isArray(save.warriors) ? save.warriors : [];
  if (!all.length) return null;

  const barracksLevel = clampInt(save.barracksLevel, 1, BARRACKS_DEPLOY.length, 1);
  const n = deployCap(barracksLevel);
  const slice = all.slice(0, n);
  const invItems = save.items && typeof save.items === 'object' ? save.items : {};

  const warriors: any[] = [];
  const items: Record<string, any> = {};

  for (const raw of slice) {
    if (!raw || typeof raw !== 'object') continue;
    const w: any = {
      id: String(raw.id || `w_${warriors.length}`).slice(0, 64),
      name: String(raw.name || 'Warrior').slice(0, 32),
      portraitSeed: clampInt(raw.portraitSeed, 0, 9999, 1),
      rarity: ['common', 'uncommon', 'rare', 'epic', 'legendary'].includes(raw.rarity)
        ? raw.rarity
        : 'common',
      level: clampInt(raw.level, 1, 40, 1),
      xp: 0,
      freePoints: 0,
      base: sanitizeStats(raw.base, {
        hp: 40,
        atk: 6,
        def: 4,
        spd: 6,
        acc: 8,
        eva: 3,
        crit: 4,
        blk: 2,
        sta: 20,
        move: 4,
      }),
      points: sanitizeStats(raw.points, {
        hp: 0,
        atk: 0,
        def: 0,
        spd: 0,
        acc: 0,
        eva: 0,
        crit: 0,
        blk: 0,
        sta: 0,
        move: 0,
      }),
      mastery: {},
      equip: {},
    };

    const mastery = raw.mastery && typeof raw.mastery === 'object' ? raw.mastery : {};
    for (const wt of ['sword', 'axemace', 'shield', 'bow', 'crossbow', 'thrown']) {
      const m = mastery[wt];
      w.mastery[wt] = {
        stars: clampInt(m?.stars, 0, 5, 0),
        xp: 0,
      };
    }

    const eq = raw.equip && typeof raw.equip === 'object' ? raw.equip : {};
    for (const slot of Object.keys(eq).slice(0, 12)) {
      const itemId = eq[slot];
      if (typeof itemId !== 'string' || !itemId) continue;
      if (!invItems[itemId]) continue;
      const it = invItems[itemId];
      w.equip[slot] = itemId;
      if (!items[itemId]) {
        items[itemId] = {
          id: itemId,
          slot: String(it.slot || slot).slice(0, 24),
          blueprintId: String(it.blueprintId || '').slice(0, 64),
          rarity: String(it.rarity || 'common').slice(0, 16),
          tier: clampInt(it.tier, 1, 10, 1),
          weaponType: it.weaponType ? String(it.weaponType).slice(0, 24) : undefined,
          stats: it.stats && typeof it.stats === 'object' ? sanitizeStats(it.stats, {}) : {},
        };
      }
    }

    warriors.push(w);
  }

  if (!warriors.length) return null;
  return {
    warriors,
    items,
    power: estimatePower(warriors, items),
    barracksLevel,
  };
}
