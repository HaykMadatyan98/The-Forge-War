'use client';

import { useEffect, useRef, useState } from 'react';
import {
  MAP_H,
  attackPreview,
  beginCombatFromDeploy,
  canAttack,
  deployCap,
  deployTileKeys,
  endUnitTurn,
  forfeitBattle,
  getActive,
  isDeployTile,
  makeBattleSnapshot,
  makePvpBattleSnapshot,
  moveRange,
  primaryWeaponType,
  runEnemyAi,
  t,
  tryAttack,
  tryMove,
  visibilityFor,
} from '@tfw/game';
import { IconWeapon, Portrait } from './icons';
import { warriorImageSrc } from './artCatalog';
import { getArtImage } from './artCache';
import { BattleWorld } from './battle3d/BattleWorld';
import { connectRealtime } from '@/lib/realtime';
import type { LiveFinishedEvent, LiveStateEvent } from '@/lib/realtime';

const LIVE_ERR_KEYS: Record<string, string> = {
  not_your_turn: 'liveErrNotYourTurn',
  reconnecting: 'liveErrReconnecting',
  not_in_match: 'liveErrNotInMatch',
  no_match: 'liveErrNoMatch',
  bad_move: 'liveErrBadMove',
  bad_attack: 'liveErrBadAttack',
  wrong_unit: 'liveErrWrongUnit',
  rejected: 'liveErrRejected',
};

function liveErrMsg(code: string) {
  const key = LIVE_ERR_KEYS[code];
  return key ? t(key) : code;
}

/** Visual layer for combatants */
type Vis = {
  x: number;
  y: number;
  bob: number;
  flash: number;
  lunge: number;
  slash: number;
  /** Facing yaw (radians): 0 = +grid Y / world +Z, π/2 = +grid X / world +X */
  face: number;
  hop: number;
};

type ProjFx = {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  t: number;
  kind: string;
};

type ImpactFx = { x: number; y: number; t: number };

type FloatFx = { x: number; y: number; text: string; life: number; color: string };

function isRanged(wt: string) {
  return wt === 'bow' || wt === 'crossbow' || wt === 'thrown';
}

function positionsFromDeploy(deploy: any) {
  return deploy.selected.map(
    (id: string, i: number) => deploy.positions[id] || { x: 1, y: Math.min(MAP_H - 1, 1 + i) },
  );
}

function snapshotForDeploy(state: any, deploy: any, mode: 'play' | 'deploy') {
  if (deploy?.kind === 'pvp' && deploy.defenderSquad) {
    return makePvpBattleSnapshot(
      state,
      deploy.defenderSquad,
      deploy.selected,
      positionsFromDeploy(deploy),
      mode,
      {
        opponentName: deploy.opponentName,
        opponentAvatar: deploy.opponentAvatar,
        isBot: !!deploy.isBot || String(deploy.opponentId || '').startsWith('bot_'),
      },
    );
  }
  return makeBattleSnapshot(
    state,
    deploy.missionId,
    deploy.difficulty,
    deploy.selected,
    positionsFromDeploy(deploy),
    mode,
  );
}

function faceToward(fromX: number, fromY: number, toX: number, toY: number, fallback = Math.PI / 2) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  if (Math.hypot(dx, dy) < 0.02) return fallback;
  // Match world: grid x → world X, grid y → world Z; yaw 0 faces +Z
  return Math.atan2(dx, dy);
}

function defaultFaceYaw(team?: string) {
  return team === 'enemy' ? -Math.PI / 2 : Math.PI / 2;
}

/**
 * Unified mission board: deploy + combat share the same 3D map/units.
 * Entering combat only removes deploy UI — camera, terrain, figures stay.
 */
export function MissionScreen({
  state,
  deploy,
  setDeploy,
  onBack,
  onVictory,
  onDefeat,
}: {
  state: any;
  deploy: any;
  setDeploy: (d: any) => void;
  onBack: () => void;
  onVictory: (battle: any) => void;
  onDefeat: (battle: any) => void;
}) {
  const cap = deployCap(state);
  const isLiveDuel = !!(deploy?.isLive && deploy?.liveMode === 'duel' && deploy?.liveMatchId);
  const youAre: 'A' | 'B' = deploy?.youAre === 'B' ? 'B' : 'A';
  const myTeam = youAre === 'B' ? 'enemy' : 'player';
  const [phase, setPhase] = useState<'deploy' | 'play'>(() =>
    deploy?.rejoinPhase === 'play' ? 'play' : 'deploy',
  );
  const [placingId, setPlacingId] = useState<string | null>(deploy.selected[0] || null);
  const [waitingOpponent, setWaitingOpponent] = useState(() =>
    !!(isLiveDuel && deploy?.rejoinPhase !== 'play' && deploy?.rejoinDeployReady?.self && !deploy?.rejoinDeployReady?.opponent),
  );
  const [turnDeadline, setTurnDeadline] = useState<number | null>(deploy?.rejoinTurnDeadline ?? null);
  const [turnSide, setTurnSide] = useState<'A' | 'B' | null>(deploy?.rejoinTurnSide ?? null);
  const [opponentOffline, setOpponentOffline] = useState(false);
  const [offlineGraceUntil, setOfflineGraceUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const liveDoneRef = useRef(false);
  const [battleTipDismissed, setBattleTipDismissed] = useState(!!state.flags?.battleTipSeen);

  const [battle, setBattle] = useState<any>(() => deploy?.rejoinBattle || snapshotForDeploy(state, deploy, 'deploy'));

  // Keep 3D combatants in sync with roster / positions during deploy only
  useEffect(() => {
    if (phase !== 'deploy') return;
    if (!deploy.selected.length) {
      return;
    }
    const b = snapshotForDeploy(state, deploy, 'deploy');
    if (b) setBattle(b);
  }, [deploy.selected, deploy.positions, deploy.missionId, deploy.difficulty, deploy.kind, deploy.defenderSquad, phase, state]);

  useEffect(() => {
    if (!isLiveDuel || phase !== 'play') return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [isLiveDuel, phase]);

  const turnSecondsLeft =
    turnDeadline != null ? Math.max(0, Math.ceil((turnDeadline - now) / 1000)) : null;
  const isMyTurnSide = turnSide === youAre;
  const offlineGraceLeft =
    offlineGraceUntil != null ? Math.max(0, Math.ceil((offlineGraceUntil - now) / 1000)) : null;

  function syncTurnMeta(ev: { turnDeadline?: number; turnSide?: 'A' | 'B' }) {
    if (ev.turnDeadline != null) setTurnDeadline(ev.turnDeadline);
    if (ev.turnSide) setTurnSide(ev.turnSide);
  }

  const hostRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<BattleWorld | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [preview, setPreview] = useState('');
  const aiTimer = useRef<any>(null);
  const visRef = useRef<Record<string, Vis>>({});
  const floatRef = useRef<FloatFx[]>([]);
  const projFxRef = useRef<ProjFx[]>([]);
  const impactRef = useRef<ImpactFx[]>([]);
  const animRef = useRef(0);
  const battleRef = useRef(battle);
  battleRef.current = battle;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const placingRef = useRef(placingId);
  placingRef.current = placingId;
  const hoverRef = useRef(hover);
  hoverRef.current = hover;
  const myTeamRef = useRef(myTeam);
  myTeamRef.current = myTeam;
  const youAreRef = useRef(youAre);
  youAreRef.current = youAre;

  function ensureVis(u: any): Vis {
    let v = visRef.current[u.id];
    if (!v) {
      v = {
        x: u.x,
        y: u.y,
        bob: Math.random() * Math.PI * 2,
        flash: 0,
        lunge: 0,
        slash: 0,
        face: defaultFaceYaw(u.team),
        hop: 0,
      };
      visRef.current[u.id] = v;
    }
    return v;
  }

  function spawnAttackFx(attacker: any, target: { x: number; y: number }, weaponType: string) {
    const v = ensureVis(attacker);
    v.face = faceToward(attacker.x, attacker.y, target.x, target.y, v.face);
    if (isRanged(weaponType)) {
      projFxRef.current.push({
        fromX: attacker.x,
        fromY: attacker.y,
        toX: target.x,
        toY: target.y,
        t: 0,
        kind: weaponType,
      });
      v.lunge = 0.55;
    } else {
      v.lunge = 1.2;
      v.slash = 1;
    }
    impactRef.current.push({ x: target.x, y: target.y, t: 0 });
    worldRef.current?.playAttack(attacker.id);
  }

  // mount WebGL world once for the whole mission (deploy → fight)
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const world = new BattleWorld(host);
    worldRef.current = world;
    return () => {
      world.dispose();
      worldRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!battle?.units) return;
    for (const u of battle.units) {
      ensureVis(u);
      // Keep visual grids snapped when unit teleported by deploy re-place
      if (phase === 'deploy') {
        const v = ensureVis(u);
        v.x = u.x;
        v.y = u.y;
      }
      const vis = u.visual || {
        seed: 1,
        weaponType: u.weaponType,
        body: u.team === 'enemy' ? 'leather' : 'cloth',
        helm: u.isBoss ? 'metal' : 'none',
      };
      getArtImage(
        warriorImageSrc({
          seed: vis.seed,
          weaponType: vis.weaponType || u.weaponType,
          body: vis.body,
          helm: vis.helm,
          offhand: vis.offhand,
        }),
      );
    }
  }, [battle?.units, phase]);

  // animation loop
  useEffect(() => {
    if (!battle) return;
    let alive = true;
    const loop = () => {
      if (!alive) return;
      const b = battleRef.current;
      if (!b) {
        animRef.current = requestAnimationFrame(loop);
        return;
      }
      const ph = phaseRef.current;
      for (const u of b.units) {
        const v = ensureVis(u);
        const dx = u.x - v.x;
        const dy = u.y - v.y;
        const dist = Math.hypot(dx, dy);
        // Slow tile-to-tile glide (~1.1–1.4s per cell at 60fps)
        const spd = dist > 1.2 ? 0.045 : dist > 0.4 ? 0.055 : 0.07;
        if (dist > 0.008) {
          v.x += dx * spd;
          v.y += dy * spd;
        } else {
          v.x = u.x;
          v.y = u.y;
        }
        if (dist > 0.035) {
          v.hop = Math.sin(performance.now() * 0.008) * 0.35 + 0.08;
          v.bob += 0.1;
          // Face direction of travel (tile glide)
          if (dist > 0.02) v.face = Math.atan2(dx, dy);
        } else {
          v.hop *= 0.65;
          v.bob += 0.03;
          // Active player / placer: look toward mouse hover on the board
          const h = hoverRef.current;
          const act = getActive(b);
          const isActivePlayer =
            ph === 'play' && act && act.id === u.id && act.team === myTeamRef.current && u.hp > 0;
          const isPlacer = ph === 'deploy' && placingRef.current === u.id && u.hp > 0;
          if (h && (isActivePlayer || isPlacer)) {
            v.face = faceToward(v.x, v.y, h.x, h.y, v.face);
          } else if (
            ph === 'play' &&
            u.team !== myTeamRef.current &&
            u.hp > 0 &&
            act &&
            act.team === myTeamRef.current
          ) {
            // Opponents glance toward the current player unit when idle
            const av = visRef.current[act.id];
            v.face = faceToward(v.x, v.y, av?.x ?? act.x, av?.y ?? act.y, v.face);
          }
        }
        if (v.flash > 0) v.flash -= 0.04;
        if (v.lunge > 0) v.lunge = Math.max(0, v.lunge - 0.1);
        if (v.slash > 0) v.slash = Math.max(0, v.slash - 0.08);
      }
      projFxRef.current = projFxRef.current
        .map((pr) => ({ ...pr, t: pr.t + 0.055 }))
        .filter((pr) => pr.t < 1.05);
      impactRef.current = impactRef.current
        .map((im) => ({ ...im, t: im.t + 0.06 }))
        .filter((im) => im.t < 1);
      floatRef.current = floatRef.current
        .map((f) => ({ ...f, life: f.life - 0.028, y: f.y - 0.008 }))
        .filter((f) => f.life > 0);

      const act = getActive(b);
      const isHumanTurn = ph === 'play' && !!(act && act.team === myTeamRef.current && !act.acted);

      // Visibility union from every living ally
      let visTiles: Set<string> | null = null;
      if (ph === 'play') {
        const scouts = b.units.filter((u: any) => u.team === myTeamRef.current && u.hp > 0);
        visTiles = new Set<string>();
        for (const s of scouts) {
          for (const k of visibilityFor(s, b.map, b.units) as Set<string> | string[]) {
            visTiles.add(k as string);
          }
        }
      }

      let reachSet = new Set<string>();
      let attackSet = new Set<string>();

      if (ph === 'deploy') {
        reachSet = new Set(deployTileKeys());
        const placerId = placingRef.current;
        const placer = placerId ? b.units.find((u: any) => u.id === placerId) : null;
        if (placer) {
          for (const u of b.units) {
            if (u.hp <= 0 || u.team === placer.team) continue;
            if (canAttack(placer, u, b.map, placer.weaponType)) attackSet.add(`${u.x},${u.y}`);
          }
        }
      } else if (isHumanTurn && act) {
        const { reach } = moveRange(act, b.map, b.units);
        reachSet = new Set(reach.map((pt: any) => `${pt.x},${pt.y}`));
        reachSet.add(`${act.x},${act.y}`);
        for (const u of b.units) {
          if (u.hp <= 0 || u.team === act.team) continue;
          if (visTiles && !visTiles.has(`${u.x},${u.y}`)) continue;
          if (canAttack(act, u, b.map, act.weaponType)) attackSet.add(`${u.x},${u.y}`);
        }
      }

      worldRef.current?.setFrame({
        map: b.map,
        units: b.units,
        vis: visRef.current,
        activeId: ph === 'deploy' ? placingRef.current : act?.id || null,
        visTiles,
        reachSet: reachSet.size ? reachSet : undefined,
        reachTone: ph === 'deploy' ? 'deploy' : 'move',
        attackSet: attackSet.size ? attackSet : undefined,
        hover,
        followCam: ph === 'play',
        fx: {
          projectiles: projFxRef.current,
          floats: floatRef.current,
          impacts: impactRef.current,
        },
      });

      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(animRef.current);
    };
  }, [battle, phase]);

  // AI only in play (not live duel — opponent is human)
  useEffect(() => {
    clearTimeout(aiTimer.current);
    if (phase !== 'play' || !battle || isLiveDuel) return;
    const act = getActive(battle);
    if (!act || battle.mode !== 'play') return;
    if (act.team === 'enemy') {
      aiTimer.current = setTimeout(() => {
        const before = battle.units.map((u: any) => ({ id: u.id, hp: u.hp, x: u.x, y: u.y }));
        const atkBefore = { x: act.x, y: act.y, weaponType: act.weaponType, id: act.id };
        runEnemyAi(battle);
        for (const u of battle.units) {
          const prev = before.find((p: any) => p.id === u.id);
          if (prev && u.hp < prev.hp) {
            const v = ensureVis(u);
            v.flash = 1;
            floatRef.current.push({
              x: u.x,
              y: u.y,
              text: `-${prev.hp - u.hp}`,
              life: 1,
              color: '#ff8a6a',
            });
            spawnAttackFx(
              { id: atkBefore.id, x: atkBefore.x, y: atkBefore.y, team: 'enemy' },
              { x: u.x, y: u.y },
              atkBefore.weaponType,
            );
          }
          if (prev && (u.x !== prev.x || u.y !== prev.y) && u.id === act.id) {
            const v = ensureVis(u);
            v.face = faceToward(prev.x, prev.y, u.x, u.y, v.face);
          }
        }
        setBattle({ ...battle });
        if (battle.mode === 'victory') onVictory(battle);
        else if (battle.mode === 'defeat') onDefeat(battle);
      }, 480);
    }
    return () => clearTimeout(aiTimer.current);
  }, [battle, phase, onVictory, onDefeat, isLiveDuel]);

  function resolveLiveOutcome(b: any) {
    if (!b || liveDoneRef.current || isLiveDuel) return;
    if (b.mode !== 'victory' && b.mode !== 'defeat') return;
    liveDoneRef.current = true;
    const iWon = youAreRef.current === 'A' ? b.mode === 'victory' : b.mode === 'defeat';
    if (iWon) onVictory(b);
    else onDefeat(b);
  }

  useEffect(() => {
    if (placingId && !deploy.selected.includes(placingId)) {
      setPlacingId(deploy.selected[0] || null);
    }
  }, [deploy.selected, placingId]);

  useEffect(() => {
    if (!isLiveDuel) return;
    const sock = connectRealtime();
    const matchId = deploy.liveMatchId as string;

    const onStart = (ev: LiveStateEvent & { youAre?: 'A' | 'B' }) => {
      if (ev.matchId !== matchId || !ev.battle) return;
      setWaitingOpponent(false);
      setOpponentOffline(false);
      setOfflineGraceUntil(null);
      setBattle(ev.battle);
      syncTurnMeta(ev);
      setPhase('play');
    };
    const onState = (ev: LiveStateEvent) => {
      if (ev.matchId !== matchId || !ev.battle) return;
      setBattle(ev.battle);
      syncTurnMeta(ev);
    };
    const onFinished = (ev: LiveFinishedEvent) => {
      if (ev.matchId !== matchId || liveDoneRef.current) return;
      liveDoneRef.current = true;
      if (ev.youWon) onVictory(battleRef.current || {});
      else onDefeat(battleRef.current || {});
    };
    const onDeployReady = (ev: { matchId?: string }) => {
      if (ev.matchId !== matchId) return;
      setWaitingOpponent(true);
    };
    const onOppDisc = (ev: { matchId?: string; graceMs?: number }) => {
      if (ev.matchId !== matchId) return;
      setOpponentOffline(true);
      setOfflineGraceUntil(Date.now() + (ev.graceMs || 60_000));
    };
    const onOppRec = (ev: { matchId?: string }) => {
      if (ev.matchId !== matchId) return;
      setOpponentOffline(false);
      setOfflineGraceUntil(null);
    };
    const onRejoin = (ev: {
      matchId?: string;
      battle?: any;
      status?: string;
      turnDeadline?: number;
      turnSide?: 'A' | 'B';
      deployReady?: { self: boolean; opponent: boolean };
    }) => {
      if (ev.matchId !== matchId) return;
      if (ev.battle) {
        setBattle(ev.battle);
        setPhase('play');
        setWaitingOpponent(false);
      } else if (ev.deployReady?.self && !ev.deployReady.opponent) {
        setWaitingOpponent(true);
      }
      syncTurnMeta(ev);
    };

    sock.on('live:battle_start', onStart);
    sock.on('live:state', onState);
    sock.on('live:finished', onFinished);
    sock.on('live:deploy_ready', onDeployReady);
    sock.on('live:opponent_disconnect', onOppDisc);
    sock.on('live:opponent_reconnect', onOppRec);
    sock.on('live:rejoin', onRejoin);
    return () => {
      sock.off('live:battle_start', onStart);
      sock.off('live:state', onState);
      sock.off('live:finished', onFinished);
      sock.off('live:deploy_ready', onDeployReady);
      sock.off('live:opponent_disconnect', onOppDisc);
      sock.off('live:opponent_reconnect', onOppRec);
      sock.off('live:rejoin', onRejoin);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLiveDuel, deploy?.liveMatchId]);

  function emitLiveAction(action: {
    type: string;
    unitId?: string;
    x?: number;
    y?: number;
    targetId?: string;
  }) {
    if (!isLiveDuel || !deploy?.liveMatchId) return;
    connectRealtime().emit('live:turn', { matchId: deploy.liveMatchId, action }, (res: any) => {
      if (res?.error) setPreview(liveErrMsg(String(res.error)));
      else if (res?.turnDeadline != null) syncTurnMeta(res);
    });
  }

  function afterPlayer() {
    setBattle({ ...battle });
    if (isLiveDuel) {
      resolveLiveOutcome(battle);
      return;
    }
    if (battle.mode === 'victory') onVictory(battle);
    else if (battle.mode === 'defeat') onDefeat(battle);
  }

  function describeTile(tile: { x: number; y: number } | null) {
    if (!tile || !battle) return '';
    const cell = battle.map[tile.y]?.[tile.x];
    if (!cell) return '';
    const bits = [
      t(cell.kind || 'grass'),
      cell.block ? t('blocked') : `${t('moveCost')}: ${cell.moveCost || 1}`,
      cell.cover ? `${t('cover')}: ${cell.cover}` : null,
      cell.height ? `${t('height')}: ${cell.height}` : null,
      phase === 'deploy' && isDeployTile(tile.x, tile.y) ? t('deployZone') : null,
    ].filter(Boolean);
    return bits.join(' · ');
  }

  const active = battle ? getActive(battle) : null;
  const humanActive = phase === 'play' && active && active.team === myTeam;
  const foeOf = (act: any) => (act?.team === 'player' ? 'enemy' : 'player');
  const recentLog = (battle?.log || []).slice(0, 3);
  const battlePhaseKey =
    phase === 'deploy'
      ? waitingOpponent
        ? 'livePvpWaitingDeploy'
        : 'battlePhaseDeploy'
      : !active
        ? 'battlePhaseWait'
        : active.team === myTeam
          ? 'battlePhaseYourTurn'
          : isLiveDuel
            ? 'livePvpWaitingOpponentTurn'
            : 'battlePhaseEnemy';
  const showBattleTip = phase === 'deploy' && !battleTipDismissed && !state.flags?.battleTipSeen;

  function onCanvasMove(e: React.MouseEvent) {
    const tile = worldRef.current?.pickTile(e) || null;
    setHover(tile);
    if (!battle) return;
    const tileDesc = describeTile(tile);
    if (phase === 'deploy') {
      setPreview(
        tileDesc +
          (placingId
            ? ` · ${t('placeUnit')}: ${state.warriors.find((w: any) => w.id === placingId)?.name || ''}`
            : ''),
      );
      return;
    }
    const act = getActive(battle);
    if (!tile || !act || act.team !== myTeam) {
      setPreview(tileDesc);
      return;
    }
    const target = battle.units.find((u: any) => u.x === tile.x && u.y === tile.y && u.hp > 0);
    if (target && target.team === foeOf(act)) {
      const p = attackPreview(battle, act, target);
      setPreview(
        p ? `${tileDesc} · ${t('hitPreview')} ${p.hit}% · ${t('dmgPreview')} ~${p.avgDmg}` : tileDesc,
      );
    } else setPreview(tileDesc);
  }

  function onCanvasClick(e: React.MouseEvent) {
    if (!battle || waitingOpponent) return;
    const tile = worldRef.current?.pickTile(e);
    if (!tile) return;

    if (phase === 'deploy') {
      // Tap own unit to select for placement
      const onTile = battle.units.find(
        (u: any) => u.team === 'player' && u.x === tile.x && u.y === tile.y && u.hp > 0,
      );
      if (onTile) {
        setPlacingId(onTile.id);
        return;
      }
      if (!placingId || !deploy.selected.includes(placingId)) return;
      if (!isDeployTile(tile.x, tile.y)) return;
      const cell = battle.map[tile.y]?.[tile.x];
      if (cell?.block) return;
      for (const [id, p] of Object.entries(deploy.positions) as any) {
        if (id !== placingId && p.x === tile.x && p.y === tile.y) return;
      }
      setDeploy({
        ...deploy,
        positions: { ...deploy.positions, [placingId]: { x: tile.x, y: tile.y } },
      });
      return;
    }

    if (battle.mode !== 'play') return;
    const act = getActive(battle);
    if (!act || act.team !== myTeam) return;
    if (act.acted) return;
    const target = battle.units.find((u: any) => u.x === tile.x && u.y === tile.y && u.hp > 0);
    if (target && target.team === foeOf(act)) {
      if (isLiveDuel) {
        emitLiveAction({ type: 'attack', unitId: act.id, targetId: target.id });
        return;
      }
      const hpBefore = target.hp;
      const res = tryAttack(battle, act, target);
      spawnAttackFx(act, target, act.weaponType);
      if (target.hp < hpBefore) {
        const tv = ensureVis(target);
        tv.flash = 1;
        floatRef.current.push({
          x: target.x,
          y: target.y,
          text: `-${hpBefore - target.hp}`,
          life: 1,
          color: '#ffd080',
        });
      } else if (res.ok) {
        floatRef.current.push({ x: target.x, y: target.y, text: t('miss'), life: 1, color: '#aaa' });
      }
      if (res.ok && act.acted) {
        endUnitTurn(battle);
        afterPlayer();
      } else setBattle({ ...battle });
      return;
    }
    if (!target) {
      if (isLiveDuel) {
        emitLiveAction({ type: 'move', unitId: act.id, x: tile.x, y: tile.y });
        return;
      }
      if (tryMove(battle, act, tile.x, tile.y)) {
        const v = ensureVis(act);
        v.face = faceToward(v.x, v.y, tile.x, tile.y, v.face);
        setBattle({ ...battle });
      }
    }
  }

  function toggleSelect(id: string) {
    if (phase !== 'deploy') return;
    const next = { ...deploy, selected: [...deploy.selected], positions: { ...deploy.positions } };
    const on = next.selected.includes(id);
    if (on) {
      next.selected = next.selected.filter((x: string) => x !== id);
      delete next.positions[id];
      setPlacingId(next.selected[0] || null);
    } else if (next.selected.length < cap) {
      next.selected.push(id);
      const used = new Set(Object.values(next.positions).map((p: any) => `${p.x},${p.y}`));
      let placed = false;
      for (let y = 0; y < MAP_H && !placed; y++) {
        for (let x = 0; x <= 2 && !placed; x++) {
          if (!used.has(`${x},${y}`)) {
            next.positions[id] = { x, y };
            placed = true;
          }
        }
      }
      setPlacingId(id);
    }
    setDeploy(next);
  }

  function startFight() {
    if (!deploy.selected.length) return;
    if (isLiveDuel) {
      const positions = deploy.selected.map(
        (id: string, i: number) => deploy.positions[id] || { x: 1, y: Math.min(9, 1 + i) },
      );
      setWaitingOpponent(true);
      connectRealtime().emit(
        'live:deploy',
        {
          matchId: deploy.liveMatchId,
          warriorIds: deploy.selected,
          positions,
        },
        (res: any) => {
          if (res?.error) {
            setWaitingOpponent(false);
            setPreview(String(res.error));
          } else if (res?.started) {
            // battle_start event will sync board
          }
        },
      );
      return;
    }
    // Prefer updating current units in place so 3D figures animate without full rebuild
    if (battle && battle.units?.length) {
      for (const id of deploy.selected) {
        const pos = deploy.positions[id];
        const u = battle.units.find((x: any) => x.id === id);
        if (u && pos) {
          u.x = pos.x;
          u.y = pos.y;
          const v = ensureVis(u);
          v.x = pos.x;
          v.y = pos.y;
        }
      }
      // Drop players not selected
      battle.units = battle.units.filter(
        (u: any) => u.team !== 'player' || deploy.selected.includes(u.id),
      );
      // Add any missing players if needed
      const have = new Set(battle.units.filter((u: any) => u.team === 'player').map((u: any) => u.id));
      const missing = deploy.selected.filter((id: string) => !have.has(id));
      if (missing.length) {
        const fresh = snapshotForDeploy(state, deploy, 'play');
        if (fresh) {
          setBattle(fresh);
          setPhase('play');
          return;
        }
      }
      beginCombatFromDeploy(battle);
      setBattle({ ...battle });
      setPhase('play');
      return;
    }
    const b = snapshotForDeploy(state, deploy, 'play');
    if (!b) return;
    setBattle(b);
    setPhase('play');
  }

  if (!battle) {
    return (
      <div className="screen" style={{ padding: '1rem' }}>
        <p className="muted">{t('empty')}</p>
        <button type="button" onClick={onBack}>
          {t('backHub')}
        </button>
      </div>
    );
  }

  return (
    <div className="battle-wrap">
      <div className="battle-stage">
        <div className="battle-phase-strip" aria-live="polite">
          <span className={`battle-phase-chip ${phase === 'deploy' ? 'active' : ''}`}>{t('battlePhaseDeploy')}</span>
          <span className="battle-phase-sep" aria-hidden>
            →
          </span>
          <span className={`battle-phase-chip ${phase === 'play' ? 'active' : ''}`}>{t(battlePhaseKey)}</span>
          {phase === 'play' && active ? (
            <span className="muted battle-phase-unit">
              · {active.name} · {t('round')} {battle.round}
              {isLiveDuel && turnSecondsLeft != null ? (
                <span
                  className={`battle-turn-timer ${isMyTurnSide && turnSecondsLeft <= 10 ? 'urgent' : ''}`}
                >
                  · {t('livePvpTurnTimer')}: {turnSecondsLeft}s
                </span>
              ) : null}
            </span>
          ) : null}
          {isLiveDuel && opponentOffline ? (
            <span className="battle-offline-chip warn">
              {t('livePvpOpponentOffline')}
              {offlineGraceLeft != null ? ` (${offlineGraceLeft}s)` : ''}
            </span>
          ) : null}
        </div>
        <div className={`battle-toolbar ${phase === 'play' ? 'battle-toolbar--play' : ''}`}>
          {phase === 'deploy' ? (
            <>
              <strong>
                {t('fight')}:{' '}
                {deploy.kind === 'pvp' && deploy.opponentName
                  ? `${t('pvp_arena')} · ${deploy.opponentName}`
                  : t(deploy.missionId)}
              </strong>
              <span className="muted">{t('clickDeploy')}</span>
              {placingId ? (
                <span className="warn">
                  {t('placeUnit')}: {state.warriors.find((w: any) => w.id === placingId)?.name}
                </span>
              ) : null}
              <span className="muted battle-preview">{preview}</span>
              <span style={{ flex: 1 }} />
              <button type="button" className="ghost" onClick={onBack}>
                {t('backHub')}
              </button>
              <button
                type="button"
                className="primary"
                disabled={!deploy.selected.length || waitingOpponent}
                onClick={startFight}
              >
                {waitingOpponent
                  ? t('livePvpWaitingDeploy') || 'Waiting opponent…'
                  : isLiveDuel
                    ? `${t('livePvpReady') || 'Ready'} (${deploy.selected.length}/${cap})`
                    : `${t('fight')} (${deploy.selected.length}/${cap})`}
              </button>
            </>
          ) : (
            <>
              <strong>{active ? `${t('yourTurn')}: ${active.name}` : ''}</strong>
              <span className="muted">
                {t('round')} {battle.round}
              </span>
              <span className="muted battle-preview">{preview}</span>
              <span style={{ flex: 1 }} />
              <button
                type="button"
                className="ghost battle-toolbar-play-hide"
                disabled={!humanActive}
                onClick={() => {
                  if (isLiveDuel) {
                    emitLiveAction({ type: 'endTurn', unitId: active?.id });
                    return;
                  }
                  endUnitTurn(battle);
                  afterPlayer();
                }}
              >
                {t('endTurn')}
              </button>
              <button
                type="button"
                className="ghost battle-toolbar-play-hide"
                onClick={() => {
                  if (isLiveDuel && deploy?.liveMatchId) {
                    connectRealtime().emit('live:finish', {
                      matchId: deploy.liveMatchId,
                      victory: false,
                    });
                    return;
                  }
                  forfeitBattle(battle);
                  if (battle.mode === 'victory') onVictory(battle);
                  else onDefeat(battle);
                }}
              >
                {t('forfeit')}
              </button>
            </>
          )}
        </div>
        <div
          ref={hostRef}
          id="battle-3d-host"
          className="battle-3d-host"
          onMouseMove={onCanvasMove}
          onMouseLeave={() => {
            setHover(null);
            setPreview('');
          }}
          onClick={onCanvasClick}
        >
          {phase === 'play' && active ? (
            <div className={`battle-turn-chip ${active.team === myTeam ? 'ally' : 'foe'}`}>
              <span className="battle-turn-chip__label">
                {active.team === myTeam ? t('yourTurn') : t('enemyTurn')}
              </span>
              <strong>{active.name}</strong>
              <span className="muted">
                {t(active.weaponType)} · {t('hp')} {active.hp}/{active.maxHp}
              </span>
            </div>
          ) : null}
          {phase === 'play' && preview ? <div className="battle-hover-chip">{preview}</div> : null}
        </div>
        {phase === 'play' && recentLog.length ? (
          <div className="battle-mini-log" aria-label={t('battleLogTitle')}>
            {recentLog.map((line: string, i: number) => (
              <div key={`${i}-${line.slice(0, 12)}`} className="battle-mini-log-line muted">
                {line}
              </div>
            ))}
          </div>
        ) : null}
        {showBattleTip ? (
          <div className="battle-tip-banner">
            <span>{t('battleTipFirst')}</span>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                state.flags = { ...(state.flags || {}), battleTipSeen: true };
                setBattleTipDismissed(true);
              }}
            >
              OK
            </button>
          </div>
        ) : null}
      </div>
      <div className="battle-side">
        {phase === 'deploy' ? (
          <div>
            <h3>{t('squad')}</h3>
            <p className="muted" style={{ fontSize: '0.8rem' }}>
              {t('deployHint')}
            </p>
            <div className="unit-list">
              {state.warriors.map((w: any) => {
                const on = deploy.selected.includes(w.id);
                const placing = placingId === w.id;
                return (
                  <button
                    key={w.id}
                    type="button"
                    className={`unit-pill deploy-unit ${on ? 'active' : ''} ${placing ? 'placing' : ''}`}
                    onClick={() => {
                      if (on) setPlacingId(w.id);
                      else toggleSelect(w.id);
                    }}
                    onDoubleClick={() => toggleSelect(w.id)}
                  >
                    <div className="row">
                      <Portrait seed={w.portraitSeed || 1} name={w.name} size={36} warrior={w} itemsById={state.items} />
                      <div>
                        <b>
                          {on ? '✓ ' : ''}
                          {w.name}
                        </b>
                        <div className="muted" style={{ fontSize: '0.75rem' }}>
                          {t(primaryWeaponType(w, state.items))}
                          {primaryWeaponType(w, state.items) === 'unarmed' ? ` · ${t('fists')}` : ''}
                          {placing ? ` · ${t('placeUnit')}` : ''}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {hover ? (
              <div className="card" style={{ padding: '0.5rem 0.65rem', marginTop: '0.6rem', fontSize: '0.85rem' }}>
                <b>
                  [{hover.x}, {hover.y}]
                </b>
                <div className="muted">{describeTile(hover) || '—'}</div>
              </div>
            ) : null}
          </div>
        ) : (
          <div>
            <h3>{t('squad')}</h3>
            {hover ? (
              <div className="card" style={{ padding: '0.5rem 0.65rem', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                <b>
                  [{hover.x}, {hover.y}]
                </b>
                <div className="muted">{describeTile(hover) || '—'}</div>
              </div>
            ) : (
              <p className="muted" style={{ fontSize: '0.82rem' }}>
                {t('tileHint')}
              </p>
            )}
            <div className="unit-list">
              {battle.units
                .filter((u: any) => u.team === myTeam || (u.team !== myTeam && u.hp > 0))
                .map((u: any) => {
                  const pct = Math.round((u.hp / u.maxHp) * 100);
                  const isAct = active && active.id === u.id;
                  return (
                    <div className={`unit-pill ${isAct ? 'active' : ''}`} key={u.id}>
                      <div className="row">
                        <IconWeapon type={u.weaponType} s={18} />
                        <b>{u.name}</b>
                      </div>
                      <div className="muted" style={{ fontSize: '0.75rem' }}>
                        {u.team === 'enemy' ? t('enemyTurn') : t('squad')} · {t(u.weaponType)} · {t('hp')}{' '}
                        {u.hp}/{u.maxHp}
                      </div>
                      <div className="hpbar">
                        <i
                          style={{
                            width: `${pct}%`,
                            background: u.team === 'enemy' ? 'var(--bad)' : 'var(--good)',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
        <div>
          <h3>{phase === 'deploy' ? t('foesLabel') : t('log')}</h3>
          {phase === 'deploy' ? (
            <div className="unit-list">
              {battle.units
                .filter((u: any) => u.team === 'enemy')
                .map((u: any) => (
                  <div className="unit-pill" key={u.id}>
                    <div className="row">
                      <IconWeapon type={u.weaponType} s={18} />
                      <b>{u.name}</b>
                    </div>
                    <div className="muted" style={{ fontSize: '0.75rem' }}>
                      {t(u.weaponType)} · {t('hp')} {u.hp}/{u.maxHp}
                      {u.isBoss ? ` · ${t('boss')}` : ''}
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="battle-log">
              {(battle.log || []).slice(0, 12).map((line: string, i: number) => (
                <div key={i} className="muted" style={{ fontSize: '0.78rem' }}>
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {phase === 'play' ? (
        <div className="battle-mobile-dock">
          <button
            type="button"
            className="primary"
            disabled={!humanActive}
            onClick={() => {
              if (isLiveDuel) {
                emitLiveAction({ type: 'endTurn', unitId: active?.id });
                return;
              }
              endUnitTurn(battle);
              afterPlayer();
            }}
          >
            {t('endTurn')}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              if (isLiveDuel && deploy?.liveMatchId) {
                connectRealtime().emit('live:finish', {
                  matchId: deploy.liveMatchId,
                  victory: false,
                });
                return;
              }
              forfeitBattle(battle);
              if (battle.mode === 'victory') onVictory(battle);
              else onDefeat(battle);
            }}
          >
            {t('forfeit')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** @deprecated — use MissionScreen */
export function DeployScreen(props: any) {
  return (
    <MissionScreen
      state={props.state}
      deploy={props.deploy}
      setDeploy={props.setDeploy}
      onBack={props.onBack}
      onVictory={props.onVictory || (() => props.onGo?.())}
      onDefeat={props.onDefeat || props.onBack}
    />
  );
}

/** Legacy play-only entry: not used by hub flow. */
export function BattleScreen(_props: {
  battle: any;
  setBattle: (b: any) => void;
  onVictory: () => void;
  onDefeat: () => void;
}) {
  return null;
}
