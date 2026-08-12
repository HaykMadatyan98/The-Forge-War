/**
 * Soft clamps on cloud save blobs — not full server authority,
 * but blocks absurd values and oversized multiplayer abuse vectors.
 */

const MAX_GOLD = 5_000_000;
const MAX_SPARKS = 50_000;
const MAX_WARRIORS = 40;
const MAX_LEVEL = 50;
const MAX_ITEMS = 400;
const MAX_INVENTORY = 200;

function clampNum(n: unknown, min: number, max: number): number | undefined {
  const v = Number(n);
  if (!Number.isFinite(v)) return undefined;
  return Math.max(min, Math.min(max, Math.round(v)));
}

export function sanitizeCloudSave(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { updatedAt: Date.now() };
  }
  const body = { ...(raw as Record<string, unknown>) };

  const gold = clampNum(body.gold, 0, MAX_GOLD);
  if (gold !== undefined) body.gold = gold;
  const sparks = clampNum(body.sparks, 0, MAX_SPARKS);
  if (sparks !== undefined) body.sparks = sparks;

  const bl = clampNum(body.barracksLevel, 1, 20);
  if (bl !== undefined) body.barracksLevel = bl;

  if (Array.isArray(body.warriors)) {
    body.warriors = body.warriors.slice(0, MAX_WARRIORS).map((w) => {
      if (!w || typeof w !== 'object') return w;
      const ww = { ...(w as Record<string, unknown>) };
      const lvl = clampNum(ww.level, 1, MAX_LEVEL);
      if (lvl !== undefined) ww.level = lvl;
      const fp = clampNum(ww.freePoints, 0, 200);
      if (fp !== undefined) ww.freePoints = fp;
      return ww;
    });
  }

  if (body.items && typeof body.items === 'object' && !Array.isArray(body.items)) {
    const items = body.items as Record<string, unknown>;
    const keys = Object.keys(items);
    if (keys.length > MAX_ITEMS) {
      const keep = keys.slice(0, MAX_ITEMS);
      const next: Record<string, unknown> = {};
      for (const k of keep) next[k] = items[k];
      body.items = next;
    }
  }

  if (Array.isArray(body.inventory)) {
    body.inventory = body.inventory.slice(0, MAX_INVENTORY);
  }

  if (typeof body.updatedAt !== 'number' || !Number.isFinite(body.updatedAt)) {
    body.updatedAt = Date.now();
  }

  return body;
}
