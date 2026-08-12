import {
  MAP_W,
  MAP_H,
  REGIONS,
  DIFFICULTY_MULT,
  WEAPON_PROFILES,
} from '../data/catalog.js';
import {
  applyDifficulty,
  buildRoundOrder,
  canAttack,
  coverFromTarget,
  coverHitPenalty,
  createMap,
  grantCombatMastery,
  grantLevelXp,
  heightMods,
  masteryExtraAttacks,
  masteryMult,
  masteryPassiveBonuses,
  moveRange,
  rollDamage,
  computeHitChance,
  visibilityFor,
  chebyshev,
} from './combat.js';
import { warriorCombatant } from './state.js';

export function findMission(missionId) {
  for (const r of REGIONS) {
    const m = r.missions.find((x) => x.id === missionId);
    if (m) return { region: r, mission: m };
  }
  return null;
}

export function startBattle(state, missionId, difficulty, deployWarriorIds, deployPositions) {
  const found = findMission(missionId);
  if (!found) return null;
  const { region, mission } = found;
  const diff = applyDifficulty(mission.enemyLvl, difficulty);
  const seed = missionId.split('').reduce((a, c) => a + c.charCodeAt(0), 0) + difficulty.length * 17;
  const map = createMap(seed, region.id);

  const players = [];
  deployWarriorIds.forEach((wid, i) => {
    const w = state.warriors.find((x) => x.id === wid);
    if (!w) return;
    const pos = deployPositions[i] || { x: 1, y: 1 + i };
    players.push(warriorCombatant(w, state.items, 'player', pos.x, pos.y));
  });

  const enemies = [];
  const count = Math.min(10, mission.enemies + (difficulty === 'brutal' ? 1 : 0));
  for (let i = 0; i < count; i++) {
    const isBoss = mission.boss && i === 0;
    const lvl = diff.lvl + (isBoss ? 2 : 0);
    const y = Math.min(MAP_H - 1, 1 + (i % (MAP_H - 2)));
    const x = MAP_W - 2 - Math.floor(i / (MAP_H - 2));
    const baseAtk = 4 + lvl;
    const baseDef = 3 + Math.floor(lvl * 0.7);
    const hp = (isBoss ? 48 : 22) + lvl * 5;
    const wTypes = ['sword', 'spear', 'bow', 'axemace', 'crossbow'];
    const weaponType = isBoss ? 'greatsword' : wTypes[i % wTypes.length];
    enemies.push({
      id: `e_${i}`,
      name: isBoss ? `Boss ${lvl}` : `Foe ${i + 1}`,
      team: 'enemy',
      x,
      y,
      hp,
      maxHp: hp,
      sta: 24 + lvl,
      maxSta: 24 + lvl,
      stats: {
        hp,
        atk: Math.round(baseAtk * (DIFFICULTY_MULT[difficulty]?.enemy || 1)),
        def: baseDef,
        spd: 6 + (i % 5),
        acc: 8 + Math.floor(lvl / 2),
        eva: 3 + (i % 3),
        crit: 4,
        blk: weaponType === 'shield' ? 8 : 2,
        sta: 24 + lvl,
        move: weaponType === 'bow' ? 3 : 4,
      },
      movePts: weaponType === 'bow' ? 3 : 4,
      weaponType,
      masteryStars: Math.min(6, Math.floor(lvl / 2)),
      acted: false,
      moved: false,
      isBoss,
      source: null,
    });
  }

  const units = [...players, ...enemies];
  const battle = {
    missionId,
    difficulty,
    regionId: region.id,
    map,
    units,
    round: 1,
    order: buildRoundOrder(units),
    orderIndex: 0,
    log: [],
    selectedId: null,
    mode: 'play', // play | victory | defeat
    rewardMult: diff.rewardMult,
    camera: { x: 0, y: 0 },
  };
  battle.selectedId = battle.order[0];
  refreshTurnFlags(battle);
  log(battle, `Round ${battle.round}`);
  return battle;
}

function log(battle, msg) {
  battle.log.unshift(msg);
  if (battle.log.length > 40) battle.log.length = 40;
}

function refreshTurnFlags(battle) {
  for (const u of battle.units) {
    if (u.hp <= 0) continue;
    // only the active unit can act; others wait
  }
  const active = getActive(battle);
  if (active) {
    active.acted = false;
    active.moved = false;
    active.movePts = active.stats.move;
    active.sta = Math.min(active.maxSta, active.sta + Math.round(active.maxSta * 0.25));
  }
}

export function getActive(battle) {
  if (!battle?.order?.length) return null;
  const id = battle.order[battle.orderIndex];
  return battle.units.find((u) => u.id === id && u.hp > 0) || null;
}

export function visibleTiles(battle) {
  const players = battle.units.filter((u) => u.team === 'player' && u.hp > 0);
  if (!players.length) return new Set();
  // union via first with shared logic
  return visibilityFor(players[0], battle.map, battle.units);
}

export function attackPreview(battle, attacker, target) {
  if (!canAttack(attacker, target, battle.map, attacker.weaponType)) return null;
  const hm = heightMods(battle.map[attacker.y][attacker.x].height, battle.map[target.y][target.x].height);
  const cover = coverFromTarget(battle.map, attacker, target);
  const m = masteryMult(attacker.masteryStars);
  const pass = masteryPassiveBonuses(attacker.masteryStars);
  const att = {
    atk: Math.round(attacker.stats.atk * m * (WEAPON_PROFILES[attacker.weaponType]?.power || 1) * (1 + pass.atkPct)) + hm.atk,
    acc: Math.round(attacker.stats.acc * m * (WEAPON_PROFILES[attacker.weaponType]?.acc || 1)) + hm.acc + pass.accFlat,
    crit: attacker.stats.crit,
  };
  const def = {
    def: target.stats.def + (pass.defFlat || 0),
    eva: target.stats.eva,
    blk: target.stats.blk + (WEAPON_PROFILES[target.weaponType]?.block ? 4 : 0),
  };
  const hit = computeHitChance(att, def, { coverPen: coverHitPenalty(cover) });
  const avgDmg = Math.max(1, Math.round(att.atk * (1 - def.def / (def.def + 40))));
  return { hit, avgDmg, cover, att, def };
}

export function tryMove(battle, unit, x, y) {
  if (!unit || unit.acted) return false;
  const { best } = moveRange(unit, battle.map, battle.units);
  const key = `${x},${y}`;
  if (!best.has(key)) return false;
  unit.x = x;
  unit.y = y;
  unit.movePts = unit.stats.move - best.get(key);
  unit.moved = true;
  return true;
}

export function tryAttack(battle, attacker, target) {
  const preview = attackPreview(battle, attacker, target);
  if (!preview || attacker.acted) return { ok: false };
  const cost = WEAPON_PROFILES[attacker.weaponType]?.sta || 8;
  if (attacker.sta < cost * 0.5) {
    // weak attack still allowed at half scale
  }
  attacker.sta = Math.max(0, attacker.sta - cost);
  const swings = 1 + masteryExtraAttacks(attacker.masteryStars);
  let total = 0;
  for (let i = 0; i < swings; i++) {
    if (target.hp <= 0) break;
    const rollHit = Math.random() * 100;
    if (rollHit > preview.hit) {
      log(battle, `${attacker.name} misses ${target.name}`);
      continue;
    }
    const { dmg, isCrit, blocked } = rollDamage(preview.att, preview.def);
    target.hp = Math.max(0, target.hp - dmg);
    total += dmg;
    let msg = `${attacker.name} hits ${target.name} for ${dmg}`;
    if (isCrit) msg += ' CRIT';
    if (blocked) msg += ' (blocked)';
    log(battle, msg);
    if (target.hp <= 0) log(battle, `${target.name} is down`);
  }
  attacker.acted = true;
  if (attacker.source && attacker.team === 'player') {
    grantCombatMastery(attacker.source, attacker.weaponType, 8 + total / 5);
  }
  return { ok: true, total };
}

export function endUnitTurn(battle) {
  const active = getActive(battle);
  if (active) active.acted = true;
  // advance order
  let guard = 0;
  do {
    battle.orderIndex += 1;
    if (battle.orderIndex >= battle.order.length) {
      battle.round += 1;
      battle.order = buildRoundOrder(battle.units);
      battle.orderIndex = 0;
      log(battle, `Round ${battle.round}`);
    }
    guard++;
  } while (guard < 40 && (!getActive(battle) || getActive(battle).hp <= 0));

  refreshTurnFlags(battle);
  checkEnd(battle);
  return getActive(battle);
}

export function checkEnd(battle) {
  const players = battle.units.filter((u) => u.team === 'player' && u.hp > 0);
  const enemies = battle.units.filter((u) => u.team === 'enemy' && u.hp > 0);
  if (!enemies.length) battle.mode = 'victory';
  else if (!players.length) battle.mode = 'defeat';
  return battle.mode;
}

export function forfeitBattle(battle) {
  battle.mode = 'defeat';
  log(battle, 'Forfeit');
}

/** Simple enemy AI */
export function runEnemyAi(battle) {
  const unit = getActive(battle);
  if (!unit || unit.team !== 'enemy' || battle.mode !== 'play') return;
  const foes = battle.units.filter((u) => u.team === 'player' && u.hp > 0);
  if (!foes.length) {
    endUnitTurn(battle);
    return;
  }

  // Prefer attacks if possible
  let best = null;
  for (const f of foes) {
    if (canAttack(unit, f, battle.map, unit.weaponType)) {
      const prev = attackPreview(battle, unit, f);
      if (!best || prev.avgDmg > best.prev.avgDmg) best = { f, prev };
    }
  }
  if (best) {
    tryAttack(battle, unit, best.f);
    endUnitTurn(battle);
    return;
  }

  // Move toward closest foe, prefer higher cover if adjacent options
  const target = foes.slice().sort((a, b) => chebyshev(unit, a) - chebyshev(unit, b))[0];
  const { reach } = moveRange(unit, battle.map, battle.units);
  let pick = null;
  let bestScore = -1e9;
  for (const cell of reach) {
    const dist = chebyshev(cell, target);
    const cover = battle.map[cell.y][cell.x].cover || 0;
    const h = battle.map[cell.y][cell.x].height || 0;
    const score = -dist * 10 + cover * 3 + h * 2;
    if (score > bestScore) {
      bestScore = score;
      pick = cell;
    }
  }
  if (pick) tryMove(battle, unit, pick.x, pick.y);

  // attack after move
  for (const f of foes) {
    if (canAttack(unit, f, battle.map, unit.weaponType)) {
      tryAttack(battle, unit, f);
      break;
    }
  }
  endUnitTurn(battle);
}

export function applyVictoryRewards(state, battle) {
  const found = findMission(battle.missionId);
  if (!found) return { rewards: {}, levelUps: [] };
  const base = found.mission.reward || {};
  const rewards = {};
  for (const [k, v] of Object.entries(base)) {
    rewards[k] = Math.round(v * (battle.rewardMult || 1));
  }
  for (const [k, v] of Object.entries(rewards)) {
    if (k === 'gold') state.gold += v;
    else state.resources[k] = (state.resources[k] || 0) + v;
  }

  // XP to deployed
  const levelUps = [];
  const players = battle.units.filter((u) => u.team === 'player' && u.source);
  for (const u of players) {
    const xp = 25 + found.mission.enemyLvl * 8 + (u.hp > 0 ? 10 : 0);
    const ups = grantLevelXp(u.source, xp);
    if (ups.length) levelUps.push({ warriorId: u.id, levels: ups, freePoints: u.source.freePoints });
    // sync mastery already on source
  }

  state.campaign.cleared[battle.missionId] = battle.difficulty;
  // unlock regions
  for (const r of REGIONS) {
    if (r.unlockAfter && state.campaign.cleared[r.unlockAfter]) {
      if (!state.campaign.unlockedRegions.includes(r.id)) state.campaign.unlockedRegions.push(r.id);
    }
  }
  // barracks auto-level soft with progress
  const clears = Object.keys(state.campaign.cleared).length;
  state.barracksLevel = Math.min(5, 1 + Math.floor(clears / 3));

  return { rewards, levelUps };
}

export function syncWarriorLoadout(battle) {
  // nothing persistent mid-battle for equip
}
