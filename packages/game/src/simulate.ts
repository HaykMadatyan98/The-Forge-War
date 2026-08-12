import {
  getActive,
  checkEnd,
  runEnemyAi,
  endUnitTurn,
  tryAttack,
  tryMove,
  attackPreview,
} from './battle';
import { canAttack, moveRange, chebyshev } from './combat';
import { makePvpBattleSnapshot } from './pvp';

/** Deterministic PRNG (LCG) for reproducible server simulations. */
export function seededRng(seed: number) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function hashSeed(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Simple auto-AI for any team (mirrors enemy AI logic). */
function runTeamAutoAi(battle: any, team: 'player' | 'enemy') {
  const unit = getActive(battle);
  if (!unit || unit.team !== team || battle.mode !== 'play') return;

  const foeTeam = team === 'player' ? 'enemy' : 'player';
  const foes = battle.units.filter((u: any) => u.team === foeTeam && u.hp > 0);
  if (!foes.length) {
    endUnitTurn(battle);
    return;
  }

  const isRanged =
    unit.weaponType === 'bow' || unit.weaponType === 'crossbow' || unit.weaponType === 'thrown';

  const scoreTarget = (f: any, preview: any) => {
    const killBonus = preview.avgDmg >= f.hp ? 80 : 0;
    const lowHpBonus = (1 - f.hp / Math.max(1, f.maxHp)) * 35;
    return preview.avgDmg * (preview.hit / 100) + killBonus + lowHpBonus;
  };

  let bestNow: { f: any; score: number } | null = null;
  for (const f of foes) {
    if (!canAttack(unit, f, battle.map, unit.weaponType)) continue;
    const prev = attackPreview(battle, unit, f);
    if (!prev) continue;
    const score = scoreTarget(f, prev);
    if (!bestNow || score > bestNow.score) bestNow = { f, score };
  }
  if (bestNow && bestNow.score >= 12) {
    tryAttack(battle, unit, bestNow.f);
    endUnitTurn(battle);
    return;
  }

  const prey = foes.slice().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.hp - b.hp)[0];
  const { reach } = moveRange(unit, battle.map, battle.units);
  const cells = [...reach, { x: unit.x, y: unit.y }];
  let pick: { x: number; y: number } | null = null;
  let bestScore = -1e9;

  for (const cell of cells) {
    const mapCell = battle.map[cell.y][cell.x];
    if (mapCell.block) continue;
    const ghost = { ...unit, x: cell.x, y: cell.y };
    let attackScore = 0;
    let canHitAny = false;
    for (const f of foes) {
      if (!canAttack(ghost, f, battle.map, unit.weaponType)) continue;
      canHitAny = true;
      const prev = attackPreview(battle, ghost, f);
      if (prev) attackScore = Math.max(attackScore, scoreTarget(f, prev));
    }
    const distPrey = chebyshev(cell, prey);
    const cover = mapCell.cover || 0;
    const height = mapCell.height || 0;
    let rangeBias = isRanged
      ? (distPrey >= 2 && distPrey <= 5 ? 8 : -distPrey * 2) + cover * 6 + height * 3
      : -distPrey * 12 + cover * 4 + height * 2;
    const score = (canHitAny ? 100 : 0) + attackScore * 1.2 + rangeBias;
    if (score > bestScore) {
      bestScore = score;
      pick = cell;
    }
  }

  if (pick && (pick.x !== unit.x || pick.y !== unit.y)) {
    tryMove(battle, unit, pick.x, pick.y);
    for (const f of foes) {
      if (canAttack(unit, f, battle.map, unit.weaponType)) {
        const prev = attackPreview(battle, unit, f);
        if (prev && prev.hit >= 40) {
          tryAttack(battle, unit, f);
          break;
        }
      }
    }
  } else if (bestNow) {
    tryAttack(battle, unit, bestNow.f);
  }
  endUnitTurn(battle);
}

/**
 * Auto-play battle until victory/defeat or step cap.
 * Both teams use AI — suitable for server-side ghost PvP validation.
 */
export function autoPlayBattle(battle: any, maxSteps = 800) {
  let steps = 0;
  while (battle.mode === 'play' && steps < maxSteps) {
    const unit = getActive(battle);
    if (!unit) break;
    if (unit.team === 'enemy') runEnemyAi(battle);
    else runTeamAutoAi(battle, 'player');
    checkEnd(battle);
    steps++;
  }
  return {
    victory: battle.mode === 'victory',
    defeat: battle.mode === 'defeat',
    mode: battle.mode,
    steps,
  };
}

/** Server-side PvP ghost simulation from attacker state + defender squad. */
export function simulatePvpBattle(
  state: any,
  defenderSquad: { warriors: any[]; items: Record<string, any>; power?: number },
  deployWarriorIds: string[],
  deployPositions: { x: number; y: number }[],
  seedKey: string,
) {
  const battle = makePvpBattleSnapshot(
    state,
    defenderSquad,
    deployWarriorIds,
    deployPositions,
    'play',
  );
  if (!battle) return null;
  battle._simSeed = hashSeed(seedKey);
  const result = autoPlayBattle(battle);
  return {
    victory: result.victory,
    defeat: result.defeat,
    mode: result.mode,
    steps: result.steps,
    battle,
  };
}
