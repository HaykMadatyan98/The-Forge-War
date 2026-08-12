import { BadRequestException, Injectable } from '@nestjs/common';
import { GameEngineService } from './game-engine.service';
import { validateDeployRoster } from './deploy-validation';

export type SimulatePvpBody = {
  state: Record<string, unknown>;
  defenderSquad: { warriors: unknown[]; items: Record<string, unknown>; power?: number };
  deployWarriorIds: string[];
  deployPositions: { x: number; y: number }[];
  seedKey?: string;
};

@Injectable()
export class BattleService {
  constructor(private readonly game: GameEngineService) {}

  async simulatePvp(body: SimulatePvpBody) {
    if (!body?.state || !body?.defenderSquad) throw new BadRequestException('missing_payload');
    const ids = Array.isArray(body.deployWarriorIds) ? body.deployWarriorIds : [];
    const positions = Array.isArray(body.deployPositions) ? body.deployPositions : [];
    if (!ids.length) throw new BadRequestException('empty_deploy');

    const { simulatePvpBattle } = this.game.engine();
    const seedKey = String(body.seedKey || `sim_${Date.now()}`);
    const result = (simulatePvpBattle as Function)(
      body.state,
      body.defenderSquad,
      ids,
      positions,
      seedKey,
    );
    if (!result) throw new BadRequestException('simulation_failed');

    return {
      victory: result.victory,
      defeat: result.defeat,
      mode: result.mode,
      steps: result.steps,
    };
  }

  /** Validate async PvP result using server simulation (both teams AI). */
  async validatePvpResult(
    attackerState: Record<string, unknown>,
    defenderSquad: { warriors: unknown[]; items: Record<string, unknown>; power?: number },
    deployWarriorIds: string[],
    deployPositions: { x: number; y: number }[],
    matchId: string,
    claimedVictory: boolean,
  ) {
    const deployCheck = validateDeployRoster(attackerState, deployWarriorIds, deployPositions);
    if (!deployCheck.ok) {
      return { accepted: !claimedVictory, reason: deployCheck.reason, simulatedVictory: false };
    }

    const { simulatePvpBattle, estimateSquadPower } = this.game.engine();
    const simFn = simulatePvpBattle as Function;
    const powerFn = estimateSquadPower as Function;
    const sim = simFn(
      attackerState,
      defenderSquad,
      deployWarriorIds,
      deployPositions,
      matchId,
    );
    if (!sim) {
      // Never trust client victory when simulation cannot run
      return { accepted: !claimedVictory, reason: 'sim_failed', simulatedVictory: false };
    }

    if (!claimedVictory) return { accepted: true, simulatedVictory: sim.victory };

    if (sim.victory) return { accepted: true, simulatedVictory: true };

    const strict = process.env.STRICT_PVP !== '0';
    const atkPower = powerFn(
      (attackerState.warriors as any[])?.filter((w) => deployWarriorIds.includes(w.id)) || [],
      (attackerState.items as Record<string, unknown>) || {},
    );
    const defPower =
      defenderSquad.power || powerFn(defenderSquad.warriors as any[], defenderSquad.items);
    const ratio = atkPower / Math.max(1, defPower);

    // Legacy soft-pass only when explicitly disabled strict mode (dev / staging)
    if (!strict && ratio >= 0.78) {
      return { accepted: true, simulatedVictory: false, softPass: true };
    }

    return { accepted: false, simulatedVictory: false, reason: 'sim_defeat', ratio };
  }
}
