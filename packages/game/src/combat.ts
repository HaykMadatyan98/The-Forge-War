import {
  MAP_W,
  MAP_H,
  WEAPON_PROFILES,
  DIFFICULTY_MULT,
  MASTERY_CAP,
  masteryXpToNext,
  levelXpToNext,
  LEVEL_CAP,
} from './catalog';

export function chebyshev(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
}

/** Height bonus: flat ACC / ATK */
export function heightMods(attackerH, defenderH) {
  const d = attackerH - defenderH;
  if (d > 0) return { acc: 8 * d, atk: 2 * d };
  if (d < 0) return { acc: 6 * d, atk: 1 * d };
  return { acc: 0, atk: 0 };
}

/** Cover: 0 none, 1 half, 2 full — reduces hit */
export function coverHitPenalty(cover) {
  if (cover >= 2) return 30;
  if (cover >= 1) return 15;
  return 0;
}

/**
 * Mastery: 0★ harsh debuff, 10★ strong.
 * stars 0..10
 */
export function masteryMult(stars) {
  const s = Math.max(0, Math.min(MASTERY_CAP, stars | 0));
  // 0 → 0.7 dmg/acc, 5 → 1.0, 10 → 1.25
  const t = s / MASTERY_CAP;
  return 0.7 + t * 0.55;
}

/** Extra attacks from mastery milestones */
export function masteryExtraAttacks(stars) {
  if (stars >= 10) return 2;
  if (stars >= 5) return 1;
  return 0;
}

export function masteryPassiveBonuses(stars) {
  return {
    atkPct: Math.max(0, (stars - 3) * 0.02),
    accFlat: stars >= 1 ? stars : 0,
    defFlat: stars >= 7 ? 2 : 0,
  };
}

/** UI: snapshot of mastery effects at a given star level (0..10). */
export function masteryBonusSnapshot(stars) {
  const s = Math.max(0, Math.min(MASTERY_CAP, stars | 0));
  const mult = masteryMult(s);
  const extra = masteryExtraAttacks(s);
  const pass = masteryPassiveBonuses(s);
  return {
    stars: s,
    mult,
    multPct: Math.round(mult * 100),
    extraAttacks: extra,
    atkPct: pass.atkPct,
    atkPctText: Math.round(pass.atkPct * 100),
    accFlat: pass.accFlat,
    defFlat: pass.defFlat,
    /** True when this star level unlocks a new milestone vs previous. */
    milestones: {
      mult: true,
      acc: s >= 1,
      atkPct: s >= 4,
      extra1: s === 5,
      def: s === 7,
      extra2: s === 10,
    },
  };
}

/** Full table 0..cap for mastery UI. */
export function masteryBonusTable(cap = MASTERY_CAP) {
  const rows = [];
  for (let s = 0; s <= cap; s++) rows.push(masteryBonusSnapshot(s));
  return rows;
}

export function computeHitChance(att, def, opts = {}) {
  const base = 55 + att.acc - def.eva + (opts.accMod || 0) - (opts.coverPen || 0);
  return Math.max(5, Math.min(95, Math.round(base)));
}

/**
 * ATK vs DEF with diminishing returns + crit/block
 */
export function rollDamage(att, def, rng = Math.random) {
  const raw = att.atk * (1 - def.def / (def.def + 40));
  let dmg = Math.max(1, Math.round(raw * (0.9 + rng() * 0.2)));
  const critChance = Math.max(0, Math.min(50, att.crit - def.blk * 0.25));
  const isCrit = rng() * 100 < critChance;
  if (isCrit) dmg = Math.round(dmg * 1.5);
  // block reduces after roll
  const blockChance = Math.max(0, Math.min(40, def.blk - att.crit * 0.2));
  const blocked = rng() * 100 < blockChance;
  if (blocked) dmg = Math.max(1, Math.round(dmg * 0.55));
  return { dmg, isCrit, blocked };
}

export function losBlocked(map, from, to) {
  // Bresenham-ish: block if wall between (not on endpoints)
  let x0 = from.x;
  let y0 = from.y;
  const x1 = to.x;
  const y1 = to.y;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  while (!(x0 === x1 && y0 === y1)) {
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
    if (x0 === x1 && y0 === y1) break;
    const cell = map[y0][x0];
    if (cell.block) return true;
  }
  return false;
}

export function coverFromTarget(map, from, to) {
  // sample cell adjacent to target toward attacker
  const dx = Math.sign(from.x - to.x);
  const dy = Math.sign(from.y - to.y);
  const cx = to.x + dx;
  const cy = to.y + dy;
  if (!inBounds(cx, cy)) return map[to.y][to.x].cover || 0;
  return map[cy][cx].cover || 0;
}

export function createMap(seed = 1, biome = 'fields') {
  const rng = mulberry32(seed);
  const map = [];

  // 1) Base grass with dry patches (uniform painted field look)
  for (let y = 0; y < MAP_H; y++) {
    const row = [];
    for (let x = 0; x < MAP_W; x++) {
      const dry = rng() > (biome === 'hills' ? 0.55 : 0.72);
      row.push({
        height: 0,
        cover: 0,
        block: false,
        moveCost: 1,
        kind: dry ? 'dry_grass' : 'grass',
        // stable scatter seed per tile for painting
        scatter: Math.floor(rng() * 1000),
      });
    }
    map.push(row);
  }

  // 2) Dirt path (center spine, soft wobble + feathered edges)
  const pathY = Math.floor(MAP_H / 2);
  for (let x = 0; x < MAP_W; x++) {
    const wobble = Math.floor(Math.sin((x + seed) * 0.55) * 1.4 + Math.cos(x * 0.3) * 0.5);
    for (let dy = -2; dy <= 2; dy++) {
      const y = pathY + wobble + dy;
      if (y < 0 || y >= MAP_H) continue;
      if (map[y][x].block) continue;
      if (Math.abs(dy) <= 0) {
        map[y][x].kind = 'dirt';
        map[y][x].moveCost = 1;
      } else if (Math.abs(dy) === 1) {
        map[y][x].kind = 'dirt_edge';
        map[y][x].moveCost = 1;
      } else if (rng() > 0.45) {
        map[y][x].kind = 'dry_grass';
      }
      map[y][x].cover = 0;
    }
  }

  // 3) River band — soft irregular edges + fords on path
  if (biome !== 'hills') {
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const along = x - y - 3.5 + Math.sin((y + seed) * 0.55) * 0.85;
        const dist = Math.abs(along);
        if (dist > 1.65) continue;
        const onPath = map[y][x].kind === 'dirt' || map[y][x].kind === 'dirt_edge';
        if (onPath || dist < 0.55) {
          map[y][x].kind = onPath ? 'ford' : 'water';
          map[y][x].moveCost = onPath ? 2 : 99;
          map[y][x].block = !onPath;
          map[y][x].cover = 0;
        } else if (dist < 1.2 && !onPath && map[y][x].kind !== 'cliff') {
          // bank — grassy wet edge, not a hard cut
          map[y][x].kind = rng() > 0.4 ? 'moss' : 'ford';
          map[y][x].moveCost = 2;
          map[y][x].block = false;
        }
      }
    }
  }

  // 4) Elevated ridges / cliffs (edges like reference)
  const ridgeCount = biome === 'hills' ? 12 : biome === 'forest' ? 5 : 4;
  for (let i = 0; i < ridgeCount; i++) {
    const x = 3 + Math.floor(rng() * (MAP_W - 6));
    const y = 1 + Math.floor(rng() * (MAP_H - 2));
    if (map[y][x].kind === 'water' || map[y][x].kind === 'ford') continue;
    map[y][x].height = biome === 'hills' ? 1 + (rng() > 0.6 ? 1 : 0) : 1;
    map[y][x].kind = 'cliff';
    map[y][x].cover = 1;
    // neighbor bank
    if (x + 1 < MAP_W && map[y][x + 1].kind === 'grass') map[y][x + 1].kind = 'dry_grass';
  }

  // 5) Tree clusters
  const treeClusters = biome === 'forest' ? 7 : biome === 'fields' ? 4 : 3;
  for (let c = 0; c < treeClusters; c++) {
    const cx = 3 + Math.floor(rng() * (MAP_W - 6));
    const cy = 1 + Math.floor(rng() * (MAP_H - 2));
    const size = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < size; i++) {
      const x = cx + Math.floor(rng() * 3) - 1;
      const y = cy + Math.floor(rng() * 3) - 1;
      if (x < 2 || x >= MAP_W - 2 || y < 0 || y >= MAP_H) continue;
      if (map[y][x].block || map[y][x].kind === 'water' || map[y][x].kind === 'ford') continue;
      if (map[y][x].kind === 'dirt') continue;
      map[y][x].kind = rng() > 0.35 ? 'tree' : 'bush';
      map[y][x].cover = map[y][x].kind === 'tree' ? 2 : 1;
      map[y][x].moveCost = 2;
    }
  }

  // 6) Rock obstacles
  const rocks = biome === 'hills' ? 10 : 5;
  for (let i = 0; i < rocks; i++) {
    const x = 3 + Math.floor(rng() * (MAP_W - 6));
    const y = 1 + Math.floor(rng() * (MAP_H - 2));
    if (map[y][x].kind === 'water' || map[y][x].kind === 'dirt') continue;
    map[y][x].kind = 'rock';
    map[y][x].block = true;
    map[y][x].cover = 0;
    map[y][x].height = map[y][x].height || 0;
  }

  // 7) Deploy lanes — clean camp grass
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < 3; x++) {
      map[y][x] = {
        height: 0,
        cover: 0,
        block: false,
        moveCost: 1,
        kind: 'camp',
        scatter: map[y][x].scatter || 1,
      };
    }
    for (let x = MAP_W - 3; x < MAP_W; x++) {
      if (map[y][x].kind === 'water') continue;
      map[y][x] = {
        height: 0,
        cover: 0,
        block: false,
        moveCost: 1,
        kind: 'dirt_edge',
        scatter: map[y][x].scatter || 2,
      };
    }
  }

  return map;
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function moveRange(unit, map, units) {
  const maxMove = unit.movePts;
  const blocked = new Set(units.filter((u) => u.hp > 0 && u.id !== unit.id).map((u) => `${u.x},${u.y}`));
  const start = `${unit.x},${unit.y}`;
  const best = new Map([[start, 0]]);
  const q = [{ x: unit.x, y: unit.y, c: 0 }];
  const reach = [];

  while (q.length) {
    const cur = q.shift();
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (!inBounds(nx, ny)) continue;
        const cell = map[ny][nx];
        if (cell.block) continue;
        const key = `${nx},${ny}`;
        if (blocked.has(key)) continue;
        const step = cell.moveCost + (cell.height > 0 ? 0 : 0);
        // diagonal costs 1 same as ortho for simplicity
        const nc = cur.c + step;
        if (nc > maxMove) continue;
        if (best.has(key) && best.get(key) <= nc) continue;
        best.set(key, nc);
        q.push({ x: nx, y: ny, c: nc });
        reach.push({ x: nx, y: ny, cost: nc });
      }
    }
  }
  return { best, reach };
}

export function canAttack(attacker, target, map, weaponType) {
  if (!target || target.hp <= 0) return false;
  if (attacker.team === target.team) return false;
  if (attacker.acted) return false;
  const prof = WEAPON_PROFILES[weaponType] || WEAPON_PROFILES.unarmed;
  const dist = chebyshev(attacker, target);
  if (dist < prof.rangeMin || dist > prof.rangeMax) return false;
  if (losBlocked(map, attacker, target)) return false;
  return true;
}

export function visibilityFor(unit, map, units) {
  // Fog: base vision from SPD, +height
  const base = 4 + Math.floor((unit.stats.spd || 0) / 6);
  const hBonus = (map[unit.y][unit.x].height || 0) * 2;
  const radius = base + hBonus;
  const vis = new Set();
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (chebyshev(unit, { x, y }) <= radius && !losBlocked(map, unit, { x, y })) {
        vis.add(`${x},${y}`);
      }
    }
  }
  // Always see self tile
  vis.add(`${unit.x},${unit.y}`);
  // Team shares vision
  for (const u of units) {
    if (u.team !== unit.team || u.hp <= 0) continue;
    const vb = 4 + Math.floor((u.stats.spd || 0) / 6) + (map[u.y][u.x].height || 0) * 2;
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (chebyshev(u, { x, y }) <= vb && !losBlocked(map, u, { x, y })) vis.add(`${x},${y}`);
      }
    }
  }
  return vis;
}

/**
 * Build initiative order for a round: sort by SPD + noise, recalc each round
 */
export function buildRoundOrder(units, rng = Math.random) {
  return units
    .filter((u) => u.hp > 0)
    .map((u) => ({
      id: u.id,
      score: (u.stats.spd || 0) + rng() * 0.01,
    }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.id);
}

export function grantCombatMastery(unit, weaponType, xp) {
  // Fists never train a weapon tree
  if (!weaponType || weaponType === 'unarmed') return;
  if (!unit.mastery[weaponType]) unit.mastery[weaponType] = { stars: 0, xp: 0 };
  const m = unit.mastery[weaponType];
  if (m.stars >= MASTERY_CAP) return;
  m.xp = Math.round((m.xp || 0) + (Number(xp) || 0));
  while (m.stars < MASTERY_CAP && m.xp >= masteryXpToNext(m.stars)) {
    m.xp = Math.round(m.xp - masteryXpToNext(m.stars));
    m.stars += 1;
  }
  if (m.xp < 1e-9) m.xp = 0;
}

export function grantLevelXp(unit, xp) {
  unit.xp = Math.round((unit.xp || 0) + (Number(xp) || 0));
  const ups = [];
  while (unit.level < LEVEL_CAP && unit.xp >= levelXpToNext(unit.level)) {
    unit.xp = Math.round(unit.xp - levelXpToNext(unit.level));
    unit.level += 1;
    // hybrid: auto tick + free points (slightly more free points at high level)
    unit.base.hp += 2;
    const pts = unit.level <= 10 ? 3 : unit.level <= 18 ? 4 : 5;
    unit.freePoints = (unit.freePoints || 0) + pts;
    ups.push(unit.level);
  }
  if (unit.xp < 1e-9) unit.xp = 0;
  return ups;
}

export function applyDifficulty(baseLvl, diff) {
  const m = DIFFICULTY_MULT[diff] || DIFFICULTY_MULT.normal;
  return {
    lvl: Math.max(1, Math.round(baseLvl * m.enemy)),
    rewardMult: m.reward,
  };
}

export { mulberry32 };
