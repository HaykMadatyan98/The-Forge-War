import { MAP_W, MAP_H } from './catalog';
import { createMap, buildRoundOrder, grantLevelXp } from './combat';
import { deployCap, warriorCombatant, effectiveStats, primaryWeaponType } from './state';
import { hubNextSteps } from './hubGuide';
import { t } from './i18n';

export type DefenseSquad = {
  warriors: any[];
  items: Record<string, any>;
  power?: number;
  barracksLevel?: number;
};

export function estimateSquadPower(warriors: any[], items: Record<string, any>): number {
  let p = 0;
  for (const w of warriors || []) {
    const st = effectiveStats(w, items);
    p += (st.hp || 0) + (st.atk || 0) * 4 + (st.def || 0) * 3 + (w.level || 1) * 12;
    const wt = primaryWeaponType(w, items);
    if (wt && wt !== 'unarmed') p += 18 + (w.mastery?.[wt]?.stars || 0) * 6;
  }
  return Math.max(1, Math.round(p));
}

/** Snapshot first N warriors + only equipped items (for server defense board). */
export function extractDefenseSquad(state: any): DefenseSquad {
  const n = deployCap(state);
  const warriors = (state.warriors || []).slice(0, n).map((w: any) => JSON.parse(JSON.stringify(w)));
  const items: Record<string, any> = {};
  for (const w of warriors) {
    const eq = w.equip || {};
    for (const slot of Object.keys(eq)) {
      const id = eq[slot];
      if (id && state.items?.[id]) items[id] = JSON.parse(JSON.stringify(state.items[id]));
    }
  }
  return {
    warriors,
    items,
    power: estimateSquadPower(warriors, items),
    barracksLevel: state.barracksLevel || 1,
  };
}

/** Relative risk of a fight vs your squad power. */
export type PvpThreat = 'advantage' | 'fair' | 'risky' | 'deadly';

export function pvpThreat(myPower: number, theirPower: number): PvpThreat {
  const mine = Math.max(1, myPower || 1);
  const theirs = Math.max(1, theirPower || 1);
  const ratio = theirs / mine;
  if (ratio < 0.78) return 'advantage';
  if (ratio <= 1.12) return 'fair';
  if (ratio <= 1.45) return 'risky';
  return 'deadly';
}

export function pvpThreatLabelKey(tier: PvpThreat): string {
  if (tier === 'advantage') return 'pvpThreatAdvantage';
  if (tier === 'risky') return 'pvpThreatRisky';
  if (tier === 'deadly') return 'pvpThreatDeadly';
  return 'pvpThreatFair';
}

/** AI defense boards at several difficulties (not real player accounts). */
export function createBotDefenseSquad(
  seed = 1,
  difficulty: 'easy' | 'normal' | 'hard' = 'normal',
  /** Scale bot strength slightly toward the player squad. */
  anchorPower = 0,
): DefenseSquad & {
  bot: true;
  displayName: string;
  difficulty: string;
  avatarKey: string;
} {
  const mult = difficulty === 'easy' ? 0.72 : difficulty === 'hard' ? 1.4 : 1;
  const count = difficulty === 'easy' ? 2 : difficulty === 'hard' ? 4 : 3;
  let lvl = Math.max(1, Math.round((2 + (seed % 5)) * mult));
  if (anchorPower > 0) {
    const target = anchorPower * (difficulty === 'easy' ? 0.7 : difficulty === 'hard' ? 1.25 : 1);
    // Rough inverse of estimateSquadPower for bare units
    const guess = Math.max(1, Math.round(target / (count * 55)));
    lvl = Math.max(1, Math.min(18, Math.round((lvl * 0.35 + guess * 0.65))));
  }
  const archetypes =
    difficulty === 'easy'
      ? ['sword', 'sword']
      : difficulty === 'hard'
        ? ['sword', 'bow', 'shield', 'axemace']
        : ['sword', 'shield', 'bow'];
  const warriors: any[] = [];
  for (let i = 0; i < count; i++) {
    const wt = archetypes[i % archetypes.length];
    const isLead = i === 0;
    warriors.push({
      id: `bot_w_${difficulty}_${seed}_${i}`,
      name: `${t('pvpBot')} ${i + 1}`,
      portraitSeed: 40 + seed + i * 7,
      rarity: isLead ? (difficulty === 'hard' ? 'epic' : 'rare') : 'common',
      level: lvl + (isLead ? 1 : 0),
      xp: 0,
      freePoints: 0,
      base: {
        hp: Math.round((42 + lvl * 4) * mult * (wt === 'shield' ? 1.12 : 1)),
        atk: Math.round((7 + lvl) * mult * (wt === 'bow' || wt === 'axemace' ? 1.08 : 1)),
        def: Math.round((5 + Math.floor(lvl * 0.8)) * mult * (wt === 'shield' ? 1.2 : 1)),
        spd: 6 + (i % 3) + (wt === 'bow' ? 1 : 0),
        acc: Math.round(8 * mult * (wt === 'bow' ? 1.15 : 1)),
        eva: 3 + (wt === 'bow' ? 1 : 0),
        crit: difficulty === 'hard' ? 8 : 4,
        blk: wt === 'shield' ? 6 : 2,
        sta: Math.round((22 + lvl) * mult),
        move: 4,
      },
      points: { hp: 0, atk: 0, def: 0, spd: 0, acc: 0, eva: 0, crit: 0, blk: 0, sta: 0, move: 0 },
      mastery: {
        sword: { stars: 0, xp: 0 },
        axemace: { stars: 0, xp: 0 },
        shield: { stars: 0, xp: 0 },
        bow: { stars: 0, xp: 0 },
        crossbow: { stars: 0, xp: 0 },
        thrown: { stars: 0, xp: 0 },
        [wt]: {
          stars: Math.min(5, Math.floor(lvl / 2) + (difficulty === 'hard' ? 1 : 0)),
          xp: 0,
        },
      },
      equip: {},
    });
  }
  const items = {};
  const label =
    difficulty === 'easy' ? t('pvpAiEasy') : difficulty === 'hard' ? t('pvpAiHard') : t('pvpAiNormal');
  const avatarKey = difficulty === 'easy' ? 'p1' : difficulty === 'hard' ? 'p4' : 'p2';
  return {
    bot: true,
    difficulty,
    avatarKey,
    displayName: `${label} #${(seed % 90) + 1}`,
    warriors,
    items,
    power: estimateSquadPower(warriors, items),
    barracksLevel: 1,
  };
}

function refreshTurnFlags(battle: any) {
  const id = battle.order[battle.orderIndex];
  for (const u of battle.units) {
    if (u.id === id) {
      u.acted = false;
      u.moved = false;
      if (u.stats) u.movePts = u.stats.move;
    } else {
      u.acted = true;
      u.moved = true;
    }
  }
}

function log(battle: any, msg: string) {
  battle.log.unshift(msg);
  if (battle.log.length > 40) battle.log.length = 40;
}

/**
 * PvP ghost fight: attacker deploys left; defender squad is AI on the right.
 */
export function startPvpBattle(
  state: any,
  defenderSquad: DefenseSquad,
  deployWarriorIds: string[],
  deployPositions: { x: number; y: number }[],
  meta?: { opponentName?: string; opponentAvatar?: string | null; isBot?: boolean },
) {
  const seed =
    9001 +
    Number(defenderSquad.power || 0) * 13 +
    (deployWarriorIds || []).join('').length * 7;
  const map = createMap(seed, 'fields');

  const players: any[] = [];
  deployWarriorIds.forEach((wid, i) => {
    const w = state.warriors.find((x: any) => x.id === wid);
    if (!w) return;
    const pos = deployPositions[i] || { x: 1, y: 1 + i };
    players.push(warriorCombatant(w, state.items, 'player', pos.x, pos.y));
  });

  const defItems = defenderSquad.items || {};
  const enemies: any[] = [];
  (defenderSquad.warriors || []).forEach((w: any, i: number) => {
    const y = Math.min(MAP_H - 1, 1 + (i % (MAP_H - 2)));
    const x = MAP_W - 2 - Math.floor(i / Math.max(1, MAP_H - 2));
    const unit = warriorCombatant(w, defItems, 'enemy', x, y);
    unit.id = `def_${w.id || i}`;
    unit.source = null;
    unit.name = w.name || `${t('foe')} ${i + 1}`;
    enemies.push(unit);
  });

  if (!players.length || !enemies.length) return null;

  const atkPlayers = (state.warriors || []).filter((w: any) =>
    (deployWarriorIds || []).includes(w.id),
  );
  const attackerPower = estimateSquadPower(atkPlayers, state.items || {});
  const defenderPower =
    defenderSquad.power || estimateSquadPower(defenderSquad.warriors, defItems);

  const units = [...players, ...enemies];
  const battle: any = {
    missionId: 'pvp_arena',
    difficulty: 'normal',
    regionId: 'fields',
    kind: 'pvp',
    map,
    units,
    round: 1,
    order: buildRoundOrder(units),
    orderIndex: 0,
    log: [],
    selectedId: null,
    mode: 'play',
    rewardMult: 1,
    camera: { x: 0, y: 0 },
    stats: {
      damageDealt: {},
      damageTaken: {},
      kills: {},
      misses: {},
      hits: {},
      startedAt: Date.now(),
    },
    pvp: {
      defenderPower,
      attackerPower,
      opponentName: meta?.opponentName || null,
      opponentAvatar: meta?.opponentAvatar ?? null,
      isBot: !!meta?.isBot,
      threat: pvpThreat(attackerPower, defenderPower),
    },
  };
  battle.selectedId = battle.order[0];
  refreshTurnFlags(battle);
  log(battle, `${t('round')} ${battle.round}`);
  const name = meta?.opponentName;
  log(battle, name ? `${t('pvpFightStart')} — ${name}` : t('pvpFightStart'));
  return battle;
}

export function makePvpBattleSnapshot(
  state: any,
  defenderSquad: DefenseSquad,
  deployWarriorIds: string[],
  deployPositions: { x: number; y: number }[],
  mode: 'play' | 'deploy' = 'play',
  meta?: { opponentName?: string; opponentAvatar?: string | null; isBot?: boolean },
) {
  const b = startPvpBattle(state, defenderSquad, deployWarriorIds, deployPositions, meta);
  if (!b) return null;
  b.mode = mode;
  if (mode === 'deploy') {
    for (const u of b.units) {
      u.acted = true;
      u.moved = true;
    }
  }
  return b;
}

function pvpRoster(battle: any, levelUps: any[] = []) {
  const st = battle.stats || {};
  const upsById = Object.fromEntries((levelUps || []).map((u: any) => [u.warriorId, u]));
  return battle.units
    .filter((u: any) => u.team === 'player')
    .map((u: any) => ({
      id: u.id,
      name: u.name,
      survived: u.hp > 0,
      hp: u.hp,
      maxHp: u.maxHp,
      damage: st.damageDealt?.[u.id] || 0,
      kills: st.kills?.[u.id] || 0,
      hits: st.hits?.[u.id] || 0,
      misses: st.misses?.[u.id] || 0,
      level: u.source?.level || 1,
      freePoints: u.source?.freePoints || 0,
      levelsGained: upsById[u.id]?.levels || [],
      weaponType: u.weaponType || 'unarmed',
      masteryStars: u.masteryStars || 0,
    }));
}

function pvpSummaryMeta(battle: any) {
  return {
    opponentName: battle.pvp?.opponentName || null,
    opponentAvatar: battle.pvp?.opponentAvatar ?? null,
    isBot: !!battle.pvp?.isBot,
    threat: battle.pvp?.threat || null,
    defenderPower: battle.pvp?.defenderPower || 0,
    attackerPower: battle.pvp?.attackerPower || 0,
  };
}

export function applyPvpVictory(state: any, battle: any) {
  const st = battle.stats || { kills: {}, damageDealt: {} };
  const players = battle.units.filter((u: any) => u.team === 'player' && u.source);
  const enemyDown = battle.units.filter((u: any) => u.team === 'enemy' && u.hp <= 0).length;
  const power = battle.pvp?.defenderPower || 50;
  const atk = Math.max(1, battle.pvp?.attackerPower || power);
  // Bigger underdog bonus; soft cap so farming weak boards stays modest
  const underdog = Math.min(1.85, Math.max(0.65, 0.55 + (power / atk) * 0.55));
  const botNerf = battle.pvp?.isBot ? 0.72 : 1;

  const gold = Math.round((18 + power * 0.09 + enemyDown * 4) * underdog * botNerf);
  const sparks = Math.max(
    1,
    Math.round((1 + enemyDown * 0.4 + power * 0.012) * underdog * botNerf),
  );
  state.gold = (state.gold || 0) + gold;
  state.sparks = (state.sparks || 0) + sparks;
  const rewards: Record<string, number> = { gold, sparks };

  const levelUps: any[] = [];
  for (const u of players) {
    const kills = st.kills?.[u.id] || 0;
    const dmg = st.damageDealt?.[u.id] || 0;
    const xp = Math.round(
      (22 + kills * 8 + Math.min(40, Math.floor(dmg / 8)) + (u.hp > 0 ? 10 : 0)) *
        underdog *
        (battle.pvp?.isBot ? 0.85 : 1),
    );
    const ups = grantLevelXp(u.source, xp);
    if (ups.length) levelUps.push({ warriorId: u.id, levels: ups, freePoints: u.source.freePoints });
  }

  const roster = pvpRoster(battle, levelUps);
  const summary = {
    result: battle.mode,
    missionId: 'pvp_arena',
    difficulty: 'normal',
    kind: 'pvp',
    rounds: battle.round,
    rewards,
    unlocked: [],
    levelUps,
    roster,
    totalDamage: roster.reduce((a: number, r: any) => a + r.damage, 0),
    totalKills: roster.reduce((a: number, r: any) => a + r.kills, 0),
    enemiesLeft: battle.units.filter((u: any) => u.team === 'enemy' && u.hp > 0).length,
    enemiesDown: enemyDown,
    storyOutroKey: null,
    nextMissionId: null,
    nextSteps: hubNextSteps(state, 2),
    ...pvpSummaryMeta(battle),
  };

  return { rewards, levelUps, unlocked: [], summary };
}

export function applyPvpDefeat(_state: any, battle: any) {
  const roster = pvpRoster(battle, []);
  const summary = {
    result: 'defeat',
    missionId: 'pvp_arena',
    difficulty: 'normal',
    kind: 'pvp',
    rounds: battle.round,
    rewards: {},
    unlocked: [],
    levelUps: [],
    roster,
    totalDamage: roster.reduce((a: number, r: any) => a + r.damage, 0),
    totalKills: roster.reduce((a: number, r: any) => a + r.kills, 0),
    enemiesLeft: battle.units.filter((u: any) => u.team === 'enemy' && u.hp > 0).length,
    enemiesDown: battle.units.filter((u: any) => u.team === 'enemy' && u.hp <= 0).length,
    storyOutroKey: null,
    nextMissionId: null,
    nextSteps: hubNextSteps(_state, 2),
    ...pvpSummaryMeta(battle),
  };
  return { rewards: {}, levelUps: [], unlocked: [], summary };
}
