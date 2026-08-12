// @ts-nocheck
import {
  MAP_W,
  MAP_H,
  REGIONS,
  DIFFICULTY_MULT,
  WEAPON_PROFILES,
} from './catalog';
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
} from './combat';
import { warriorCombatant } from './state';
import { ensureCampaignProgress, nextMissionId, storyOutroKey } from './campaign';
import { t } from './i18n';
import { hubNextSteps } from './hubGuide';

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
    const hp = (isBoss ? 56 : 22) + lvl * (isBoss ? 7 : 5);
    const wTypes = ['sword', 'spear', 'bow', 'axemace', 'crossbow'];
    let weaponType = isBoss ? 'greatsword' : wTypes[i % wTypes.length];
    // Boss identities per mission
    const bossLoad = {
      fields_boss: { weaponType: 'greatsword', nameKey: 'boss_fields' },
      forest_boss: { weaponType: 'bow', nameKey: 'boss_forest' },
      hills_boss: { weaponType: 'axemace', nameKey: 'boss_hills' },
    };
    const bl = isBoss ? bossLoad[missionId] : null;
    if (bl) weaponType = bl.weaponType;
    const seed = Math.abs((i + 1) * 7919 + lvl * 13 + (isBoss ? 333 : 0) + String(missionId).length * 41);
    const metal = isBoss ? 'steel' : i % 3 === 0 ? 'copper' : 'iron';
    const kits = ['raider', 'bandit', 'outlaw', 'veteran', 'skirmisher'];
    const kit = isBoss ? 'boss' : kits[i % kits.length];
    const bodyStyle =
      isBoss ? 'iron' : kit === 'veteran' || i % 3 === 0 ? 'iron' : 'leather';
    const helmStyle =
      isBoss ? 'metal' : kit === 'bandit' ? 'none' : kit === 'veteran' || i % 4 === 0 ? 'metal' : i % 3 === 0 ? 'leather' : 'none';
    enemies.push({
      id: `e_${i}`,
      name: isBoss ? t(bl?.nameKey || 'boss') : `${t('foe')} ${i + 1}`,
      team: 'enemy',
      x,
      y,
      hp,
      maxHp: hp,
      sta: 24 + lvl + (isBoss ? 12 : 0),
      maxSta: 24 + lvl + (isBoss ? 12 : 0),
      stats: {
        hp,
        atk: Math.round(baseAtk * (DIFFICULTY_MULT[difficulty]?.enemy || 1) * (isBoss ? 1.15 : 1)),
        def: baseDef + (isBoss ? 4 : 0),
        spd: isBoss ? 5 : 6 + (i % 5),
        acc: 8 + Math.floor(lvl / 2) + (isBoss ? 3 : 0),
        eva: 3 + (i % 3),
        crit: isBoss ? 8 : 4,
        blk: weaponType === 'shield' || isBoss ? 8 : 2,
        sta: 24 + lvl,
        move: weaponType === 'bow' || weaponType === 'crossbow' ? 3 : 4,
      },
      movePts: weaponType === 'bow' || weaponType === 'crossbow' ? 3 : 4,
      weaponType,
      masteryStars: Math.min(8, Math.floor(lvl / 2) + (isBoss ? 2 : 0)),
      acted: false,
      moved: false,
      isBoss,
      source: null,
      /** Enemy kits: distinct silhouettes from player allies. */
      visual: {
        seed,
        weaponType,
        weaponMetal: metal,
        weaponBp: null,
        offhand: kit === 'veteran' && weaponType === 'sword' ? 'shield_iron' : null,
        helm: helmStyle,
        body: bodyStyle,
        legs: bodyStyle === 'iron' || kit === 'raider' ? 'leather' : 'cloth',
        accessory: false,
        team: 'enemy',
        boss: !!isBoss,
        kit,
      },
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
    mode: 'play', // deploy | play | victory | defeat
    rewardMult: diff.rewardMult,
    camera: { x: 0, y: 0 },
    stats: {
      damageDealt: {},
      damageTaken: {},
      kills: {},
      misses: {},
      hits: {},
      startedAt: Date.now(),
    },
  };
  battle.selectedId = battle.order[0];
  refreshTurnFlags(battle);
  log(battle, `${t('round')} ${battle.round}`);
  return battle;
}

/** Shared map seed for deploy + combat (must match startBattle). */
export function battleMapSeed(missionId, difficulty) {
  return String(missionId || '')
    .split('')
    .reduce((a, c) => a + c.charCodeAt(0), 0) + String(difficulty || '').length * 17;
}

/** Player deployment columns (left side of the board). */
export function isDeployTile(x, y) {
  return x >= 0 && x <= 2 && y >= 0 && y < MAP_H;
}

export function deployTileKeys() {
  const keys = [];
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x <= 2; x++) keys.push(`${x},${y}`);
  }
  return keys;
}

/** Rebuild battle snapshot for deploy UI / launch (same map & enemies every time). */
export function makeBattleSnapshot(state, missionId, difficulty, deployWarriorIds, deployPositions, mode = 'play') {
  const b = startBattle(state, missionId, difficulty, deployWarriorIds, deployPositions);
  if (!b) return null;
  b.mode = mode;
  if (mode === 'deploy') {
    // Pause initiative until fight starts — no turn actions
    for (const u of b.units) {
      u.acted = true;
      u.moved = true;
    }
  }
  return b;
}

/** Switch from deploy placement into live combat (same units/map). */
export function beginCombatFromDeploy(battle) {
  if (!battle) return;
  for (const u of battle.units) {
    u.acted = false;
    u.moved = false;
    if (u.stats) u.movePts = u.stats.move;
  }
  battle.order = buildRoundOrder(battle.units.filter((u) => u.hp > 0));
  battle.orderIndex = 0;
  battle.selectedId = battle.order[0] || null;
  battle.mode = 'play';
  battle.round = 1;
  battle.log = [];
  refreshTurnFlags(battle);
  log(battle, `${t('round')} ${battle.round}`);
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
    atk:
      Math.round(
        attacker.stats.atk *
          m *
          (WEAPON_PROFILES[attacker.weaponType]?.power || WEAPON_PROFILES.unarmed.power) *
          (1 + pass.atkPct),
      ) + hm.atk,
    acc:
      Math.round(
        attacker.stats.acc * m * (WEAPON_PROFILES[attacker.weaponType]?.acc || WEAPON_PROFILES.unarmed.acc),
      ) +
      hm.acc +
      pass.accFlat,
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
  const cost = WEAPON_PROFILES[attacker.weaponType]?.sta || WEAPON_PROFILES.unarmed.sta;
  if (attacker.sta < cost * 0.5) {
    // weak attack still allowed at half scale
  }
  attacker.sta = Math.max(0, attacker.sta - cost);
  const swings = 1 + masteryExtraAttacks(attacker.masteryStars);
  let total = 0;
  if (!battle.stats) {
    battle.stats = { damageDealt: {}, damageTaken: {}, kills: {}, misses: {}, hits: {} };
  }
  for (let i = 0; i < swings; i++) {
    if (target.hp <= 0) break;
    const rollHit = Math.random() * 100;
    if (rollHit > preview.hit) {
      log(battle, `${attacker.name} — ${t('miss')} → ${target.name}`);
      battle.stats.misses[attacker.id] = (battle.stats.misses[attacker.id] || 0) + 1;
      continue;
    }
    const { dmg, isCrit, blocked } = rollDamage(preview.att, preview.def);
    target.hp = Math.max(0, target.hp - dmg);
    total += dmg;
    battle.stats.hits[attacker.id] = (battle.stats.hits[attacker.id] || 0) + 1;
    battle.stats.damageDealt[attacker.id] = (battle.stats.damageDealt[attacker.id] || 0) + dmg;
    battle.stats.damageTaken[target.id] = (battle.stats.damageTaken[target.id] || 0) + dmg;
    let msg = `${attacker.name} ${t('logHits')} ${target.name} ${t('logFor')} ${dmg}`;
    if (isCrit) msg += ` · ${t('logCrit')}`;
    if (blocked) msg += ` · ${t('logBlocked')}`;
    log(battle, msg);
    if (target.hp <= 0) {
      log(battle, `${target.name} — ${t('logDown')}`);
      battle.stats.kills[attacker.id] = (battle.stats.kills[attacker.id] || 0) + 1;
    }
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
      log(battle, `${t('round')} ${battle.round}`);
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
  log(battle, t('forfeit'));
}

/** Smarter tactical AI: kill focus, cover, attack-range positioning */
export function runEnemyAi(battle) {
  const unit = getActive(battle);
  if (!unit || unit.team !== 'enemy' || battle.mode !== 'play') return;
  const foes = battle.units.filter((u) => u.team === 'player' && u.hp > 0);
  if (!foes.length) {
    endUnitTurn(battle);
    return;
  }

  const allies = battle.units.filter((u) => u.team === 'enemy' && u.hp > 0 && u.id !== unit.id);
  const isBoss = !!unit.isBoss;
  const isRanged =
    unit.weaponType === 'bow' || unit.weaponType === 'crossbow' || unit.weaponType === 'thrown';

  const scoreTarget = (f, preview) => {
    const killBonus = preview.avgDmg >= f.hp ? 80 : 0;
    const lowHpBonus = (1 - f.hp / Math.max(1, f.maxHp)) * 35;
    const dmgScore = preview.avgDmg * (preview.hit / 100);
    // bosses pressure injured heroes harder
    const bossPressure = isBoss ? lowHpBonus * 0.5 : 0;
    return dmgScore + killBonus + lowHpBonus + bossPressure;
  };

  // 1) Best attack available now
  let bestNow = null;
  for (const f of foes) {
    if (!canAttack(unit, f, battle.map, unit.weaponType)) continue;
    const prev = attackPreview(battle, unit, f);
    if (!prev) continue;
    const score = scoreTarget(f, prev);
    if (!bestNow || score > bestNow.score) bestNow = { f, prev, score };
  }
  // bosses / high ACC: attack if good shot, don't wander
  if (bestNow && (bestNow.score >= 12 || isBoss || bestNow.prev.hit >= 55)) {
    tryAttack(battle, unit, bestNow.f);
    endUnitTurn(battle);
    return;
  }

  // 2) Choose priority prey
  const prey = foes
    .slice()
    .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.hp - b.hp)[0];

  const { reach } = moveRange(unit, battle.map, battle.units);
  // always consider current tile
  const cells = [...reach, { x: unit.x, y: unit.y }];
  let pick = null;
  let bestScore = -1e9;

  for (const cell of cells) {
    const mapCell = battle.map[cell.y][cell.x];
    if (mapCell.block) continue;
    // simulate standing here
    const ghost = { ...unit, x: cell.x, y: cell.y };
    let attackScore = 0;
    let canHitAny = false;
    for (const f of foes) {
      if (!canAttack(ghost, f, battle.map, unit.weaponType)) continue;
      canHitAny = true;
      const prev = attackPreview(battle, ghost, f);
      if (!prev) continue;
      attackScore = Math.max(attackScore, scoreTarget(f, prev));
    }
    const distPrey = chebyshev(cell, prey);
    const cover = mapCell.cover || 0;
    const height = mapCell.height || 0;
    // ranged likes distance 2–5 and cover; melee wants close
    let rangeBias = 0;
    if (isRanged) {
      rangeBias = distPrey >= 2 && distPrey <= 5 ? 8 : -distPrey * 2;
      rangeBias += cover * 6 + height * 3;
    } else {
      rangeBias = -distPrey * 12 + cover * 4 + height * 2;
    }
    // avoid standing on allies path greedily is ok
    const allyProx = allies.reduce((s, a) => s + (chebyshev(cell, a) === 0 ? -50 : 0), 0);
    const stayTax = cell.x === unit.x && cell.y === unit.y ? 1 : 0;
    const score =
      (canHitAny ? 100 : 0) + attackScore * 1.2 + rangeBias + stayTax + allyProx;

    if (score > bestScore) {
      bestScore = score;
      pick = cell;
    }
  }

  if (pick && (pick.x !== unit.x || pick.y !== unit.y)) {
    tryMove(battle, unit, pick.x, pick.y);
  }

  // 3) Attack after move
  let bestAfter = null;
  for (const f of foes) {
    if (!canAttack(unit, f, battle.map, unit.weaponType)) continue;
    const prev = attackPreview(battle, unit, f);
    if (!prev) continue;
    const score = scoreTarget(f, prev);
    if (!bestAfter || score > bestAfter.score) bestAfter = { f, score };
  }
  if (bestAfter) tryAttack(battle, unit, bestAfter.f);
  endUnitTurn(battle);
}

export function applyVictoryRewards(state, battle) {
  const found = findMission(battle.missionId);
  if (!found) return { rewards: {}, levelUps: [] };
  const base = found.mission.reward || {};
  /** @type {Record<string, number>} */
  const rewards = {};
  for (const [k, v] of Object.entries(base)) {
    rewards[k] = Math.round(Number(v) * (battle.rewardMult || 1));
  }
  for (const [k, v] of Object.entries(rewards)) {
    if (k === 'gold') state.gold += v;
    else state.resources[k] = (state.resources[k] || 0) + v;
  }

  // XP — participation-scaled (kills, damage, survival) × difficulty
  const levelUps = [];
  const st = battle.stats || { damageDealt: {}, kills: {} };
  const players = battle.units.filter((u) => u.team === 'player' && u.source);
  const diffXp =
    battle.difficulty === 'brutal' ? 1.4 : battle.difficulty === 'hard' ? 1.2 : 1;
  for (const u of players) {
    const kills = st.kills?.[u.id] || 0;
    const dmg = st.damageDealt?.[u.id] || 0;
    const baseXp = 30 + found.mission.enemyLvl * 11;
    const xp = Math.round(
      (baseXp + kills * 10 + Math.min(50, Math.floor(dmg / 6)) + (u.hp > 0 ? 14 : 0)) * diffXp,
    );
    const ups = grantLevelXp(u.source, xp);
    if (ups.length) levelUps.push({ warriorId: u.id, levels: ups, freePoints: u.source.freePoints });
  }

  // Small gold bonus for clearance efficiency
  const killsTotal = players.reduce((a, u) => a + (st.kills?.[u.id] || 0), 0);
  if (killsTotal > 0) {
    const bonusGold = Math.round(killsTotal * 3 * (battle.rewardMult || 1));
    state.gold += bonusGold;
    rewards.gold = (Number(rewards.gold) || 0) + bonusGold;
  }

  // Sparks: soft loop currency (also used to skip job timers)
  const sparkGain = Math.max(1, Math.round((1 + killsTotal * 0.15) * (battle.rewardMult || 1)));
  state.sparks = (state.sparks || 0) + sparkGain;
  rewards.sparks = sparkGain;

  state.campaign.cleared[battle.missionId] = battle.difficulty;
  // Resources unlock via Research only (not campaign)
  const unlocked = [];
  ensureCampaignProgress(state);
  // barracks auto-level soft with progress
  const clears = Object.keys(state.campaign.cleared).length;
  state.barracksLevel = Math.min(5, 1 + Math.floor(clears / 3));

  const summary = buildBattleSummary(state, battle, rewards, unlocked, levelUps);
  return {
    rewards,
    levelUps,
    unlocked,
    summary,
  };
}

export function buildBattleSummary(state, battle, rewards = {}, unlocked = [], levelUps = []) {
  const st = battle.stats || { damageDealt: {}, kills: {}, misses: {}, hits: {} };
  const players = battle.units.filter((u) => u.team === 'player');
  const upsById = Object.fromEntries((levelUps || []).map((u) => [u.warriorId, u]));
  const roster = players.map((u) => {
    const src = u.source;
    return {
      id: u.id,
      name: u.name,
      survived: u.hp > 0,
      hp: u.hp,
      maxHp: u.maxHp,
      damage: st.damageDealt[u.id] || 0,
      kills: st.kills[u.id] || 0,
      hits: st.hits[u.id] || 0,
      misses: st.misses[u.id] || 0,
      level: src?.level || 1,
      freePoints: src?.freePoints || 0,
      levelsGained: upsById[u.id]?.levels || [],
      weaponType: u.weaponType || 'unarmed',
      masteryStars: u.masteryStars || 0,
    };
  });

  // Post-battle "what next" using live campaign state
  const nextSteps = hubNextSteps(state, 3);

  return {
    result: battle.mode,
    missionId: battle.missionId,
    difficulty: battle.difficulty,
    rounds: battle.round,
    rewards,
    unlocked,
    levelUps: levelUps || [],
    roster,
    totalDamage: roster.reduce((a, r) => a + r.damage, 0),
    totalKills: roster.reduce((a, r) => a + r.kills, 0),
    enemiesLeft: battle.units.filter((u) => u.team === 'enemy' && u.hp > 0).length,
    enemiesDown: battle.units.filter((u) => u.team === 'enemy' && u.hp <= 0).length,
    storyOutroKey: battle.mode === 'victory' ? storyOutroKey(battle.missionId) : null,
    nextMissionId: battle.mode === 'victory' ? nextMissionId(battle.missionId) : null,
    nextSteps,
  };
}

export function syncWarriorLoadout(battle) {
  // nothing persistent mid-battle for equip
}
