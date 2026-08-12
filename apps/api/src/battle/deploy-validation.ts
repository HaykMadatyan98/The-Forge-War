const BARRACKS_DEPLOY = [2, 4, 6, 8, 10];

function deployCap(state: Record<string, unknown>) {
  const level = Math.max(1, Number(state.barracksLevel) || 1);
  return BARRACKS_DEPLOY[Math.min(level, BARRACKS_DEPLOY.length) - 1];
}

type DeployCheck = { ok: true } | { ok: false; reason: string };

/** Validate deploy roster against attacker save (mirrors @tfw/game deployCap rules). */
export function validateDeployRoster(
  state: Record<string, unknown>,
  warriorIds: string[],
  positions: { x: number; y: number }[],
): DeployCheck {
  const cap = deployCap(state);
  const ids = Array.isArray(warriorIds) ? warriorIds.filter(Boolean) : [];
  if (!ids.length) return { ok: false, reason: 'empty_deploy' };
  if (ids.length > cap) return { ok: false, reason: 'over_deploy_cap' };

  const warriors = (state.warriors as { id: string }[]) || [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) return { ok: false, reason: 'duplicate_warrior' };
    seen.add(id);
    if (!warriors.some((w) => w.id === id)) return { ok: false, reason: 'invalid_warrior' };
  }

  if (positions?.length) {
    const posSeen = new Set<string>();
    for (let i = 0; i < Math.min(ids.length, positions.length); i++) {
      const p = positions[i];
      if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') {
        return { ok: false, reason: 'invalid_position' };
      }
      if (p.x < 0 || p.x > 2 || p.y < 0 || p.y > 9) return { ok: false, reason: 'position_out_of_zone' };
      const key = `${p.x},${p.y}`;
      if (posSeen.has(key)) return { ok: false, reason: 'position_overlap' };
      posSeen.add(key);
    }
  }

  return { ok: true };
}
