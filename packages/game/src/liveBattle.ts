import { MAP_W, MAP_H } from './catalog';
import { createMap, buildRoundOrder } from './combat';
import { warriorCombatant } from './state';
import { beginCombatFromDeploy, getActive, tryMove, tryAttack, endUnitTurn, checkEnd } from './battle';
import { t } from './i18n';

export type LiveSquadInput = {
  warriors: any[];
  items: Record<string, any>;
  power?: number;
  displayName?: string;
};

/**
 * Build a shared live duel: side A on the left (team player), side B on the right (team enemy).
 * Client for B treats team === 'enemy' as "my units".
 */
export function makeLiveDuelSnapshot(
  squadA: LiveSquadInput,
  squadB: LiveSquadInput,
  deployA: { warriorIds: string[]; positions: { x: number; y: number }[] },
  deployB: { warriorIds: string[]; positions: { x: number; y: number }[] },
  mode: 'deploy' | 'play' = 'play',
) {
  const seed = 4242 + (squadA.power || 0) * 3 + (squadB.power || 0) * 7;
  const map = createMap(seed, 'fields');

  const unitsA: any[] = [];
  deployA.warriorIds.forEach((wid, i) => {
    const w = (squadA.warriors || []).find((x) => x.id === wid);
    if (!w) return;
    const pos = deployA.positions[i] || { x: 1, y: Math.min(MAP_H - 1, 1 + i) };
    const u: any = warriorCombatant(w, squadA.items || {}, 'player', pos.x, pos.y);
    u.id = `A_${w.id}`;
    u.ownerSide = 'A';
    u.source = null;
    unitsA.push(u);
  });

  const unitsB: any[] = [];
  deployB.warriorIds.forEach((wid, i) => {
    const w = (squadB.warriors || []).find((x) => x.id === wid);
    if (!w) return;
    const pos = deployB.positions[i] || {
      x: MAP_W - 2,
      y: Math.min(MAP_H - 1, 1 + i),
    };
    // Mirror to right side if left-biased
    const x = pos.x <= 2 ? MAP_W - 1 - pos.x : pos.x;
    const u: any = warriorCombatant(w, squadB.items || {}, 'enemy', x, pos.y);
    u.id = `B_${w.id}`;
    u.ownerSide = 'B';
    u.source = null;
    u.name = w.name || `${t('foe')} ${i + 1}`;
    unitsB.push(u);
  });

  if (!unitsA.length || !unitsB.length) return null;

  const units = [...unitsA, ...unitsB];
  const battle: any = {
    missionId: 'live_duel',
    difficulty: 'normal',
    regionId: 'fields',
    kind: 'live',
    map,
    units,
    round: 1,
    order: buildRoundOrder(units),
    orderIndex: 0,
    log: [],
    selectedId: null,
    mode,
    rewardMult: 1,
    stats: {
      damageDealt: {},
      damageTaken: {},
      kills: {},
      misses: {},
      hits: {},
      startedAt: Date.now(),
    },
    live: {
      nameA: squadA.displayName || 'A',
      nameB: squadB.displayName || 'B',
      powerA: squadA.power || 0,
      powerB: squadB.power || 0,
    },
  };

  if (mode === 'deploy') {
    for (const u of battle.units) {
      u.acted = true;
      u.moved = true;
    }
  } else {
    beginCombatFromDeploy(battle);
  }
  return battle;
}

export function sideForUnit(unit: any): 'A' | 'B' {
  if (unit?.ownerSide === 'A' || unit?.ownerSide === 'B') return unit.ownerSide;
  return unit?.team === 'player' ? 'A' : 'B';
}

export function activeSide(battle: any): 'A' | 'B' | null {
  const act = getActive(battle);
  if (!act) return null;
  return sideForUnit(act);
}

export type LiveAction =
  | { type: 'move'; unitId: string; x: number; y: number }
  | { type: 'attack'; unitId: string; targetId: string }
  | { type: 'endTurn'; unitId?: string };

/** Apply one live action if it belongs to the acting side. Returns { ok, err? }. */
export function applyLiveAction(battle: any, side: 'A' | 'B', action: LiveAction) {
  if (!battle || battle.mode !== 'play') return { ok: false, err: 'not_play' };
  const act = getActive(battle);
  if (!act || act.hp <= 0) return { ok: false, err: 'no_active' };
  if (sideForUnit(act) !== side) return { ok: false, err: 'not_your_turn' };

  if (action.type === 'endTurn') {
    endUnitTurn(battle);
    checkEnd(battle);
    return { ok: true };
  }

  if (action.unitId && action.unitId !== act.id) return { ok: false, err: 'wrong_unit' };

  if (action.type === 'move') {
    if (!tryMove(battle, act, action.x, action.y)) return { ok: false, err: 'bad_move' };
    return { ok: true };
  }

  if (action.type === 'attack') {
    const target = battle.units.find((u: any) => u.id === action.targetId && u.hp > 0);
    if (!target) return { ok: false, err: 'no_target' };
    if (sideForUnit(target) === side) return { ok: false, err: 'friendly' };
    const res = tryAttack(battle, act, target);
    if (!res.ok) return { ok: false, err: 'bad_attack' };
    if (act.acted) endUnitTurn(battle);
    checkEnd(battle);
    return { ok: true };
  }

  return { ok: false, err: 'unknown_action' };
}

/** Strip non-serializable fields for websocket transport. */
export function serializeBattle(battle: any) {
  if (!battle) return null;
  return JSON.parse(
    JSON.stringify(battle, (key, value) => {
      if (key === 'source') return null;
      return value;
    }),
  );
}
